"""Test case CRUD, generation trigger, and export."""
from __future__ import annotations

import asyncio
import csv
import io
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_job_repo, get_requirement_repo, get_testcase_repo
from app.core.exceptions import NotFoundError
from app.db.repository import JobRepository, RequirementRepository, TestCaseRepository
from app.db.session import get_db
from app.schemas.schemas import ExportRequest, GenerateRequest, JobRead, TestCaseCreate, TestCaseRead, TestCaseUpdate

router = APIRouter()


@router.post("", response_model=TestCaseRead, status_code=201)
async def create_test_case(
    payload: TestCaseCreate,
    req_repo: RequirementRepository = Depends(get_requirement_repo),
    tc_repo: TestCaseRepository = Depends(get_testcase_repo),
    db: AsyncSession = Depends(get_db),
):
    """Manually create a test case."""
    try:
        await req_repo.get_or_raise(payload.requirement_id)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc))

    tc = await tc_repo.create(
        requirement_id=payload.requirement_id,
        title=payload.title,
        format=payload.format.upper(),
        content=payload.content,
        priority=payload.priority.upper(),
        tags=payload.tags,
        scenario_type=payload.scenario_type,
        edited=True,
    )
    await db.commit()
    await db.refresh(tc)
    return tc


@router.post("/generate", response_model=JobRead, status_code=202)
async def trigger_generation(
    payload: GenerateRequest,
    req_repo: RequirementRepository = Depends(get_requirement_repo),
    job_repo: JobRepository = Depends(get_job_repo),
    db: AsyncSession = Depends(get_db),
):
    """Start async test case generation. Returns a job to poll/stream."""
    try:
        req = await req_repo.get_or_raise(payload.requirement_id)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc))

    job = await job_repo.create(
        requirement_id=payload.requirement_id,
        format=payload.format,
        count_hint=payload.count_hint,
        status="PENDING",
    )
    await db.commit()
    await db.refresh(job)

    from app.workers.tasks import run_generate_test_cases
    asyncio.create_task(run_generate_test_cases(
        job_id=job.id,
        requirement_id=payload.requirement_id,
        project_id=req.project_id,
        fmt=payload.format,
        count_hint=payload.count_hint,
        additional_context=payload.additional_context or "",
    ))

    return job


@router.get("/requirement/{requirement_id}", response_model=list[TestCaseRead])
async def list_test_cases(
    requirement_id: str,
    format: str | None = Query(None),
    tc_repo: TestCaseRepository = Depends(get_testcase_repo),
):
    return await tc_repo.list_by_requirement(requirement_id, fmt=format)


@router.get("/{testcase_id}", response_model=TestCaseRead)
async def get_test_case(
    testcase_id: str,
    tc_repo: TestCaseRepository = Depends(get_testcase_repo),
):
    try:
        return await tc_repo.get_or_raise(testcase_id)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc))


@router.patch("/{testcase_id}", response_model=TestCaseRead)
async def update_test_case(
    testcase_id: str,
    payload: TestCaseUpdate,
    tc_repo: TestCaseRepository = Depends(get_testcase_repo),
    db: AsyncSession = Depends(get_db),
):
    try:
        tc = await tc_repo.get_or_raise(testcase_id)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc))

    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(tc, k, v)
    tc.edited     = True
    tc.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(tc)
    return tc


@router.delete("/{testcase_id}", status_code=204)
async def delete_test_case(
    testcase_id: str,
    tc_repo: TestCaseRepository = Depends(get_testcase_repo),
    db: AsyncSession = Depends(get_db),
):
    try:
        tc = await tc_repo.get_or_raise(testcase_id)
    except NotFoundError as exc:
        raise HTTPException(404, str(exc))
    await tc_repo.delete(tc)
    await db.commit()


@router.post("/export")
async def export_test_cases(
    payload: ExportRequest,
    tc_repo: TestCaseRepository = Depends(get_testcase_repo),
):
    """Export test cases as CSV or JSON."""
    fmt_filter = None if payload.format == "BOTH" else payload.format

    if payload.requirement_id:
        cases = list(await tc_repo.list_by_requirement(payload.requirement_id, fmt=fmt_filter))
    elif payload.project_id:
        cases = list(await tc_repo.list_by_project(payload.project_id, fmt=fmt_filter))
    else:
        raise HTTPException(400, "Provide either requirement_id or project_id")

    if not cases:
        raise HTTPException(404, "No test cases found")

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

    if payload.file_type == "json":
        body = json.dumps([
            {
                "id": tc.id, "title": tc.title, "format": tc.format,
                "priority": tc.priority, "scenario_type": tc.scenario_type,
                "tags": tc.tags, "content": tc.content, "edited": tc.edited,
                "created_at": tc.created_at.isoformat(),
            }
            for tc in cases
        ], indent=2, ensure_ascii=False).encode()
        return StreamingResponse(
            io.BytesIO(body), media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="testcases_{ts}.json"'},
        )

    buf = io.StringIO()
    w   = csv.writer(buf)
    w.writerow(["ID", "Title", "Format", "Priority", "Scenario Type", "Tags", "Content", "Edited", "Created At"])
    for tc in cases:
        w.writerow([tc.id, tc.title, tc.format, tc.priority, tc.scenario_type or "",
                    tc.tags or "", tc.content, tc.edited, tc.created_at.isoformat()])
    buf.seek(0)
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8-sig")), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="testcases_{ts}.csv"'},
    )
