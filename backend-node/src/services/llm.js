/**
 * LLM generation service — Anthropic, OpenAI, Gemini.
 * Generates BDD / Manual test cases with RAG context.
 */
import { config } from '../config.js';
import { retrieveContext } from './document.js';

const BDD_SYSTEM = `You are an expert QA engineer writing BDD test cases in Gherkin format.

Given a requirement and documentation context, generate thorough test cases covering:
- Happy path / positive scenarios
- Negative and boundary cases
- Edge cases
- Security considerations where relevant

RULES:
- Use clean Gherkin with 2-space indentation.
- Keep scenario titles short and unique.
- Each scenario must be self-contained.

RESPONSE: return ONLY a valid JSON array, no markdown, no extra text:
[
  {
    "title": "Short descriptive title",
    "scenario_type": "positive"|"negative"|"edge"|"security"|"performance",
    "priority": "HIGH"|"MEDIUM"|"LOW",
    "tags": "comma,separated",
    "content": "Feature: ...\\n\\nScenario: ...\\n  Given ...\\n  When ...\\n  Then ..."
  }
]`;

const MANUAL_SYSTEM = `You are an expert QA engineer writing structured manual test cases.

RULES:
- Give each case a unique ID prefix: TC-<AREA>-<NNN>.
- Steps must be atomic and in execution order.
- Expected results must be observable.

RESPONSE: return ONLY a valid JSON array, no markdown, no extra text:
[
  {
    "title": "TC-XXX-001 · Short title",
    "scenario_type": "positive"|"negative"|"edge"|"security"|"performance",
    "priority": "HIGH"|"MEDIUM"|"LOW",
    "tags": "comma,separated",
    "content": {
      "preconditions": "...",
      "test_data": "...",
      "steps": [{"step": 1, "action": "...", "expected": "..."}]
    }
  }
]`;

function buildPrompt(req, chunks, countHint, extra) {
  const ctx   = chunks.length ? chunks.join('\n\n---\n\n') : 'No documentation context available.';
  const count = countHint === 'auto' ? 'an appropriate number of' : countHint;
  const focus = extra?.trim() ? `\n## Focus\n${extra}` : '';
  return `## Requirement
Title: ${req.title}
Description:
${req.description || 'No description.'}
Labels: ${req.labels || ''}

## Documentation Context
${ctx}

## Instructions
Generate ${count} test cases covering all important scenarios.${focus}

Return ONLY the JSON array.`;
}

function cleanAndParse(raw) {
  let text = raw.trim()
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```$/m, '')
    .trim();
  try {
    const result = JSON.parse(text);
    if (!Array.isArray(result)) throw new Error(`Expected array, got ${typeof result}`);
    return result;
  } catch (e) {
    throw new Error(`LLM returned invalid JSON: ${e.message}\nRaw (first 300): ${text.slice(0, 300)}`);
  }
}

async function callLLM(system, user, provider, model) {
  if (provider === 'anthropic') {
    if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const resp   = await client.messages.create({
      model, max_tokens: config.llmMaxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return cleanAndParse(resp.content[0].text);
  }

  if (provider === 'openai') {
    if (!config.openaiApiKey) throw new Error('OPENAI_API_KEY is not set');
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const resp   = await client.chat.completions.create({
      model, max_tokens: config.llmMaxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    return cleanAndParse(resp.choices[0].message.content || '');
  }

  if (provider === 'gemini') {
    if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY is not set');
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI      = new GoogleGenerativeAI(config.geminiApiKey);
    const geminiModel = genAI.getGenerativeModel({
      model,
      systemInstruction: system,
    });
    const resp = await geminiModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: config.llmMaxTokens, temperature: 0.3 },
    });
    return cleanAndParse(resp.response.text());
  }

  throw new Error(`Unknown provider: ${provider}. Must be anthropic, openai, or gemini`);
}

export async function generateTestCases({
  requirement, projectId, fmt = 'BDD', countHint = 'auto',
  additionalContext = '', llmProvider, llmModel, customInstructions = '',
}) {
  if (fmt === 'BOTH') {
    const [bdd, manual] = await Promise.all([
      generateTestCases({ requirement, projectId, fmt: 'BDD', countHint, additionalContext, llmProvider, llmModel, customInstructions }),
      generateTestCases({ requirement, projectId, fmt: 'MANUAL', countHint, additionalContext, llmProvider, llmModel, customInstructions }),
    ]);
    bdd.forEach(t => t.format = 'BDD');
    manual.forEach(t => t.format = 'MANUAL');
    return [...bdd, ...manual];
  }

  // RAG — retrieve relevant document chunks
  const query  = `${requirement.title} ${requirement.description || ''}`;
  const chunks = await retrieveContext(query, projectId);
  console.log(`[llm] RAG context: ${chunks.length} chunks, format=${fmt}`);

  let system = fmt === 'BDD' ? BDD_SYSTEM : MANUAL_SYSTEM;
  if (customInstructions) system += `\n\n## Project Instructions\n${customInstructions}`;

  const user = buildPrompt(requirement, chunks, countHint, additionalContext);

  // One retry on parse failure
  let cases;
  try {
    cases = await callLLM(system, user, llmProvider, llmModel);
  } catch (e) {
    if (e.message.includes('invalid JSON')) {
      console.warn('[llm] Parse failed, retrying once');
      cases = await callLLM(system, user, llmProvider, llmModel);
    } else throw e;
  }

  // Normalise
  for (const tc of cases) {
    if (typeof tc.content === 'object') tc.content = JSON.stringify(tc.content, null, 2);
    tc.format        = tc.format || fmt;
    tc.scenario_type = tc.scenario_type || 'positive';
    tc.priority      = tc.priority || 'MEDIUM';
    tc.tags          = tc.tags || '';
  }

  console.log(`[llm] Generated ${cases.length} test cases`);
  return cases;
}
