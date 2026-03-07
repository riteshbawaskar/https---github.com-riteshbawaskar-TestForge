export function StatCard({ num, label, icon }: { num: number; label: string; icon?: string; color?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="text-2xl font-bold text-gray-900">{num.toLocaleString()}</div>
      <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
        {icon && <span>{icon}</span>}{label}
      </div>
    </div>
  );
}
