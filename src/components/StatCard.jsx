export default function StatCard({ label, value, change, icon: Icon }) {
  return (
    <div className="glass-panel rounded-2xl p-5 hover:border-guitar-600/30 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold mt-1 tracking-tight">{value}</p>
          {change && (
            <p className="text-xs text-muted mt-2">{change}</p>
          )}
        </div>
        {Icon && (
          <div className="p-2.5 rounded-xl bg-guitar-600/10 text-guitar-500 group-hover:bg-guitar-600/20 transition-colors">
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  )
}
