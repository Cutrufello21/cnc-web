import { isDone, isCold, driverStops, driverDone, driverCold, driverPackages, pharmTag, checkInStatus, initials } from '../../pages/MobileDispatch'

export default function DriverCard({ name, driverNumber, stops, onClick }) {
  const ds = driverStops(name, stops)
  const done = driverDone(name, stops)
  const cold = driverCold(name, stops)
  const pkgs = driverPackages(name, stops)
  const total = ds.length
  const pct = total ? Math.round((done / total) * 100) : 0
  const status = checkInStatus(name, stops)
  const ini = initials(name)
  const pharm = pharmTag(name, stops)

  const avatarColors = {
    none: 'bg-[#F0F2F7] text-[#9BA5B4]',
    go: 'bg-[#E8F1FF] text-[#4A9EFF]',
    done: 'bg-[#E6F5EE] text-[#27AE60]',
  }

  const statusConfig = {
    none: { label: 'Not started', dot: '#9BA5B4', bg: 'bg-[#F0F2F7] text-[#9BA5B4]' },
    go: { label: 'In progress', dot: '#4A9EFF', bg: 'bg-[#E8F1FF] text-[#4A9EFF]' },
    done: { label: 'Complete', dot: '#27AE60', bg: 'bg-[#E6F5EE] text-[#27AE60]' },
  }

  const sc = statusConfig[status]

  return (
    <div
      className="border border-[#F0F2F7] rounded-2xl bg-white p-3.5 mb-2.5 cursor-pointer active:bg-[#F7F8FB] transition-colors"
      onClick={onClick}
    >
      {/* Top row */}
      <div className="flex items-start gap-3 mb-2.5">
        <div className={`w-[38px] h-[38px] rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${avatarColors[status]}`}>
          {ini}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-[#0B1E3D]">{name}</span>
            {driverNumber && <span className="text-xs text-[#9BA5B4] font-medium">#{driverNumber}</span>}
          </div>
          <div className={`inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sc.bg}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
            {sc.label}
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide shrink-0 ${pharm.colorClass}`}>
          {pharm.label}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex items-center text-center border-t border-[#F0F2F7] pt-2">
        <div className="flex-1">
          <div className="text-sm font-bold text-[#0B1E3D]">
            {total}
            {pkgs !== total && <span className="text-[10px] font-medium text-[#9BA5B4] ml-0.5">({pkgs} pkg)</span>}
          </div>
          <div className="text-[10px] text-[#9BA5B4] font-medium uppercase tracking-wide">Stops</div>
        </div>
        <div className="w-px h-6 bg-[#F0F2F7]" />
        <div className="flex-1">
          <div className="text-sm font-bold text-[#4A9EFF]">{cold}</div>
          <div className="text-[10px] text-[#9BA5B4] font-medium uppercase tracking-wide">Cold Chain</div>
        </div>
        <div className="w-px h-6 bg-[#F0F2F7]" />
        <div className="flex-1">
          <div className="text-sm font-bold text-[#0B1E3D]">{done}</div>
          <div className="text-[10px] text-[#9BA5B4] font-medium uppercase tracking-wide">Delivered</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-[3px] bg-[#F0F2F7] rounded-full mt-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${status === 'done' ? 'bg-[#27AE60]' : 'bg-[#4A9EFF]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
