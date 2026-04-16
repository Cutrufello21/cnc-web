import DriverCard from './DriverCard'
import WarningBanner from './WarningBanner'
import DispatchSummary from './DispatchSummary'
import RecentLog from './RecentLog'
import SortList from './SortList'
import RoutingEditor from './RoutingEditor'
import WeatherWidget from './WeatherWidget'
import StopDistribution from './StopDistribution'
import UnassignedSection from './UnassignedSection'
import UnassignedZips from './UnassignedZips'

export default function RoutesView(p) {
const {
  data, loading, error, selectedDay, weekOffset, setWeekOffset,
  showRouting, setShowRouting, showSortList, setShowSortList,
  showUnassigned, setShowUnassigned, zipSearch, setZipSearch,
  handleDayChange, fetchDispatchData, handleMoveComplete, handleUndo,
  moveToast, setMoveToast, lastMove, undoing,
  dismissedWarnings, setDismissedWarnings,
  totalStops, totalColdChain, allActiveDrivers, activeDrivers, inactiveDrivers,
  // Send actions
  sendingRoutes, routesSent, handleSendRoutes,
  sentSnapshot, resending, handleResendChanges,
  sendingCorrections, correctionsSent, handleSendCorrections,
  sendingResendCorrections, handleResendCorrections,
  sendingForceAll, forceAllSent, handleForceSendAll,
  sendingCallIns, callInsSent, callInPreview, handlePreviewCallIns, handleConfirmCallIns,
  // AI
  aiLoading, aiResult, setAiResult, aiApplying, handleAiSuggest, handleAiApply,
} = p

if (loading) return (
  <div className="dispatch__loading">
    <div className="dispatch__spinner" />
    <p>Loading dispatch data from sheets...</p>
  </div>
)

if (error) return (
  <div className="dispatch__error">
    <p>{error}</p>
    <button onClick={fetchDispatchData}>Retry</button>
  </div>
)

if (!data) return null

return (
  <>
            {/* Day selector + Routing Rules */}
            <div className="dispatch__days-row">
              <div className="dispatch__days">
                <button className="dispatch__week-btn" onClick={() => setWeekOffset(w => w - 1)} title="Previous week">‹</button>
                {(data.allDays || ['Monday','Tuesday','Wednesday','Thursday','Friday']).map((day) => (
                  <button
                    key={day}
                    className={`dispatch__day ${selectedDay === day && !showRouting ? 'dispatch__day--active' : ''}`}
                    onClick={() => { setShowRouting(false); setShowSortList(false); setShowUnassigned(false); handleDayChange(day) }}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
                <button className="dispatch__week-btn" onClick={() => setWeekOffset(w => w + 1)} title="Next week">›</button>
                {weekOffset !== 0 && (
                  <button className="dispatch__week-today" onClick={() => setWeekOffset(0)}>Today</button>
                )}
                {data.weekMonday && (
                  <span className="dispatch__week-label">
                    {data.weekMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {(() => {
                      const fri = new Date(data.weekMonday); fri.setDate(fri.getDate() + 4);
                      return fri.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    })()}
                  </span>
                )}
              </div>
              <div className="dispatch__zip-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  className="dispatch__zip-input"
                  placeholder="Search by ZIP..."
                  value={zipSearch}
                  onChange={e => setZipSearch(e.target.value.replace(/[^0-9]/g, ''))}
                />
                {zipSearch && (
                  <button className="dispatch__zip-clear" onClick={() => setZipSearch('')}>&times;</button>
                )}
              </div>
              <div className="dispatch__tools-right">
                <button
                  className={`dispatch__day dispatch__day--routing ${showSortList ? 'dispatch__day--routing-active' : ''}`}
                  onClick={() => { setShowSortList(!showSortList); setShowRouting(false); setShowUnassigned(false) }}
                >
                  Sort List
                </button>
                <button
                  className={`dispatch__day dispatch__day--routing ${showRouting ? 'dispatch__day--routing-active' : ''}`}
                  onClick={() => { setShowRouting(!showRouting); setShowSortList(false); setShowUnassigned(false) }}
                >
                  Routing Rules
                </button>
                <button
                  className={`dispatch__day dispatch__day--routing ${showUnassigned ? 'dispatch__day--routing-active' : ''}`}
                  onClick={() => { setShowUnassigned(!showUnassigned); setShowRouting(false); setShowSortList(false) }}
                >
                  Unassigned
                </button>
              </div>
            </div>


            {showSortList && <SortList deliveryDate={data.deliveryDateObj ? `${data.deliveryDateObj.getFullYear()}-${String(data.deliveryDateObj.getMonth()+1).padStart(2,'0')}-${String(data.deliveryDateObj.getDate()).padStart(2,'0')}` : null} />}
            {showRouting && <RoutingEditor />}
            {showUnassigned && <UnassignedZips />}

            {!showRouting && !showSortList && !showUnassigned && <>
            {/* Header row */}
            <div className="dispatch__top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div>
                  <h1 className="dispatch__heading">
                    {data.deliveryDay} Delivery
                  </h1>
                  <p className="dispatch__date">
                    {(data.deliveryDateObj || new Date()).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <WeatherWidget />
              </div>
              <div className="dispatch__actions">
                {moveToast && (
                  <div className={`dispatch__move-toast ${moveToast.startsWith('Undo error') ? 'dispatch__move-toast--err' : ''}`}>
                    <span>{moveToast}</span>
                    {lastMove && !undoing && (
                      <button className="dispatch__undo-btn" onClick={handleUndo}>Undo</button>
                    )}
                    {!lastMove && (
                      <button className="dispatch__toast-close" onClick={() => setMoveToast(null)}>✕</button>
                    )}
                  </div>
                )}
                {(data.unassigned?.length > 0) && (
                  <button
                    className="dispatch__alert-btn"
                    onClick={() => { setShowUnassigned(true); setShowRouting(false); setShowSortList(false) }}
                    title={`${data.unassigned.length} unassigned orders`}
                  >
                    <span className="dispatch__alert-flag">&#9873;</span>
                    <span className="dispatch__alert-count">{data.unassigned.length}</span>
                  </button>
                )}
                <button
                  className={`dispatch__callin-btn ${callInsSent ? 'dispatch__callin-btn--done' : ''}`}
                  onClick={handlePreviewCallIns}
                  disabled={sendingCallIns}
                  title="Send call-in orders to BioTouch"
                >
                  {sendingCallIns ? 'Sending...' : callInsSent ? 'Sent' : 'SICI'}
                </button>
                <button
                  className="dispatch__send-btn dispatch__send-btn--ai"
                  onClick={handleAiSuggest}
                  disabled={aiLoading || totalStops === 0}
                  title="Get AI-powered driver assignment suggestions"
                >
                  {aiLoading ? 'Analyzing...' : '✦ AI Suggest'}
                </button>
                <button
                  className={`dispatch__send-btn ${routesSent ? 'dispatch__send-btn--done' : ''}`}
                  onClick={handleSendRoutes}
                  disabled={sendingRoutes || totalStops === 0}
                >
                  {sendingRoutes ? 'Sending...' : routesSent ? 'Sent' : 'Send Routes'}
                </button>
                {sentSnapshot && (
                  <button
                    className="dispatch__send-btn dispatch__send-btn--resend"
                    onClick={handleResendChanges}
                    disabled={resending}
                  >
                    {resending ? 'Sending...' : 'Resend Changes'}
                  </button>
                )}
                <button
                  className={`dispatch__send-btn dispatch__send-btn--corrections ${correctionsSent ? 'dispatch__send-btn--done' : ''}`}
                  onClick={handleSendCorrections}
                  disabled={sendingCorrections || correctionsSent || totalStops === 0}
                >
                  {correctionsSent ? 'Sent' : sendingCorrections ? 'Sending...' : 'Send Corrections'}
                </button>
                <button
                  className="dispatch__send-btn dispatch__send-btn--corrections"
                  onClick={handleResendCorrections}
                  disabled={sendingResendCorrections || totalStops === 0}
                  title="Resend every currently-reassigned stop to BioTouch (ignores already-sent, but skips stops that never moved)"
                >
                  {sendingResendCorrections ? 'Sending...' : 'Resend Corrections'}
                </button>
                <button
                  className={`dispatch__send-btn dispatch__send-btn--corrections ${forceAllSent ? 'dispatch__send-btn--done' : ''}`}
                  onClick={handleForceSendAll}
                  disabled={sendingForceAll || totalStops === 0}
                  title="Force-send WFL the full order list for every driver (ignores already-sent tracking)"
                >
                  {sendingForceAll ? 'Sending...' : forceAllSent ? 'Force Sent' : 'Force Send All'}
                </button>
              </div>
            </div>

            {/* Warnings */}
            {data.warnings?.filter((w) => !dismissedWarnings.has(w.type)).map((w, i) => (
              <WarningBanner key={i} warning={w} onDismiss={() => {
                setDismissedWarnings(prev => new Set([...prev, w.type]))
              }} />
            ))}


            {/* Summary cards */}
            <DispatchSummary
              totalStops={totalStops}
              totalColdChain={totalColdChain}
              activeDriverCount={allActiveDrivers.length}
              totalDriverCount={data.drivers?.length ?? 0}
              unassignedCount={data.unassigned?.length ?? 0}
              routingRuleCount={data.routingRuleCount ?? 0}
            />

            {/* Call-in preview */}
            {callInPreview && (
              <div className="dispatch__callin-preview">
                <div className="dispatch__callin-header">
                  <h3>Call-In Orders Preview — {callInPreview.length} order{callInPreview.length !== 1 ? 's' : ''}</h3>
                  <div className="dispatch__callin-actions">
                    <button className="dispatch__callin-cancel" onClick={() => setCallInPreview(null)}>Cancel</button>
                    <button className="dispatch__callin-confirm" onClick={handleConfirmCallIns} disabled={sendingCallIns}>
                      {sendingCallIns ? 'Sending...' : 'Confirm & Send to BioTouch'}
                    </button>
                  </div>
                </div>
                <div className="dispatch__callin-table-wrap">
                  <table className="dispatch__callin-table">
                    <thead>
                      <tr><th>Order #</th><th>Patient Name</th><th>Address</th><th>City</th><th>ZIP</th></tr>
                    </thead>
                    <tbody>
                      {callInPreview.map((r, i) => (
                        <tr key={i}><td>{r.orderId}</td><td>{r.name}</td><td>{r.address}</td><td>{r.city}</td><td>{r.zip}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Stop distribution */}
            <StopDistribution drivers={data.drivers} />

            {/* Active drivers */}
            <section className="dispatch__section">
              <h2 className="dispatch__section-title">
                Active Drivers
                <span className="dispatch__section-count">{activeDrivers.length}</span>
              </h2>
              <div className="dispatch__drivers">
                {activeDrivers
                  .sort((a, b) => (b.stops || 0) - (a.stops || 0))
                  .map((driver) => (
                    <DriverCard
                      key={driver['Driver Name']}
                      driver={driver}
                      allDrivers={data.drivers}
                      selectedDay={selectedDay}
                      deliveryDate={data.deliveryDateObj}
                      onRefresh={() => fetchDispatchData(selectedDay)}
                      onMoveComplete={handleMoveComplete}
                    />
                  ))}
              </div>
            </section>

            {/* Inactive drivers */}
            {inactiveDrivers.length > 0 && (
              <section className="dispatch__section">
                <h2 className="dispatch__section-title">
                  No Stops Today
                  <span className="dispatch__section-count dispatch__section-count--muted">
                    {inactiveDrivers.length}
                  </span>
                </h2>
                <div className="dispatch__drivers dispatch__drivers--inactive">
                  {inactiveDrivers.map((driver) => (
                    <DriverCard
                      key={driver['Driver Name']}
                      driver={driver}
                      inactive
                      allDrivers={data.drivers}
                      selectedDay={selectedDay}
                      deliveryDate={data.deliveryDateObj}
                      onRefresh={() => fetchDispatchData(selectedDay)}
                      onMoveComplete={handleMoveComplete}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Unassigned orders */}
            {data.unassigned?.length > 0 && !dismissedWarnings.has('unassigned-section') && (
              <UnassignedSection
                unassigned={data.unassigned}
                drivers={data.drivers}
                selectedDay={selectedDay}
                onRefresh={() => fetchDispatchData(selectedDay)}
                onDismiss={() => setDismissedWarnings(prev => new Set([...prev, 'unassigned', 'unassigned-section']))}
              />
            )}

            {/* Recent dispatch log */}
            {data.recentLogs?.length > 0 && (
              <RecentLog logs={data.recentLogs} />
            )}
            </>}

      {/* AI Dispatch Suggestions Modal */}
      {aiResult && (
        <div className="dispatch__ai-overlay" onClick={() => setAiResult(null)}>
          <div className="dispatch__ai-modal" onClick={e => e.stopPropagation()}>
            <div className="dispatch__ai-header">
              <h3 className="dispatch__ai-title">✦ AI Dispatch Suggestions</h3>
              <button className="dispatch__ai-close" onClick={() => setAiResult(null)}>✕</button>
            </div>
            {aiResult.summary && (
              <p className="dispatch__ai-summary">{aiResult.summary}</p>
            )}
            <div className="dispatch__ai-table-wrap">
              <table className="dispatch__ai-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Stops</th>
                    <th>Cold</th>
                    <th>Areas</th>
                    <th>Confidence</th>
                    <th>Reasoning</th>
                  </tr>
                </thead>
                <tbody>
                  {(aiResult.assignments || [])
                    .filter(a => a.stop_count > 0)
                    .sort((a, b) => b.stop_count - a.stop_count)
                    .map((a, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{a.driver_name}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{a.stop_count}</td>
                      <td style={{ textAlign: 'center', color: '#2563eb', fontWeight: 600 }}>{a.cold_chain_count || 0}</td>
                      <td style={{ fontSize: 12, maxWidth: 260, lineHeight: 1.5 }}>
                        {(a.zips || []).map(z => {
                          const city = aiResult.zip_city_map?.[z]
                          return city ? `${city} (${z})` : z
                        }).join(', ')}
                      </td>
                      <td>
                        <span className={`dispatch__ai-badge dispatch__ai-badge--${a.confidence}`}>
                          {a.confidence}
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: '#64748b', maxWidth: 250 }}>{a.reasoning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {aiResult.flags?.length > 0 && (
              <div className="dispatch__ai-flags">
                <h4>⚠ Flags</h4>
                {aiResult.flags.map((f, i) => (
                  <p key={i} className="dispatch__ai-flag">{f.reason}</p>
                ))}
              </div>
            )}
            {aiResult.stats && (
              <div className="dispatch__ai-stats">
                {aiResult.stats.total_stops && <span>{aiResult.stats.total_stops} stops</span>}
                {aiResult.stats.total_drivers && <span>{aiResult.stats.total_drivers} drivers</span>}
                {aiResult.stats.flagged > 0 && <span>{aiResult.stats.flagged} flagged</span>}
              </div>
            )}
            <div className="dispatch__ai-actions">
              <button
                className="dispatch__ai-apply"
                onClick={handleAiApply}
                disabled={aiApplying}
              >
                {aiApplying ? 'Applying...' : `Apply All (${aiResult.assignments?.filter(a => a.stop_count > 0).length} drivers)`}
              </button>
              <button className="dispatch__ai-cancel" onClick={() => setAiResult(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
  </>
  )
}
