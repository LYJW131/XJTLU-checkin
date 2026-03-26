import React, { useState } from 'react';

const AttendanceCodeSignIn = ({ selectedUsers }) => {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [status, setStatus] = useState('');
    const [results, setResults] = useState([]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!code) return;

        setLoading(true);
        setMessage(null);
        setStatus('');
        setResults([]);

        try {
            const response = await fetch('/api/attendancecode', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: code,
                    usernames: selectedUsers || []
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                const res = data.results || [];
                setResults(res);
                if (res.length === 0) {
                    setMessage('NO USERS SELECTED OR PROCESSED');
                    setStatus('error');
                }
            } else {
                setStatus('error');
                const errorMsg = data.detail?.error ||
                    (typeof data.detail === 'string' ? data.detail : null) ||
                    data.message ||
                    'ACCESS DENIED';
                setMessage(errorMsg);
            }
        } catch (error) {
            setStatus('error');
            setMessage('SYSTEM ERROR: CONNECTION FAILED');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card">
            <h2>MANUAL OVERRIDE</h2>
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    placeholder="ENTER ATTENDANCE CODE"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    disabled={loading}
                />
                <button type="submit" disabled={loading || !code}>
                    {loading ? 'PROCESSING...' : 'EXECUTE'}
                </button>
            </form>

            {/* Course info card - from first result with valid data */}
            {results.length > 0 && (() => {
                const info = results.find(r => r.data && r.data.moduleDate);
                if (!info) return null;
                const d = info.data;
                return (
                    <div style={{
                        marginTop: '1rem',
                        padding: '12px 16px',
                        borderRadius: '6px',
                        border: '1px solid var(--gold-dim)',
                        background: 'rgba(212, 175, 55, 0.06)',
                        textAlign: 'left',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        lineHeight: 1.7,
                        color: 'var(--text-secondary)',
                    }}>
                        <div style={{ color: 'var(--gold-primary)', fontWeight: 600, marginBottom: '6px', fontSize: '0.85rem' }}>
                            {d.moduleTypeGroup}
                        </div>
                        <div>{d.moduleDate} &nbsp; {d.moduleTime}</div>
                        <div style={{ color: 'var(--text-secondary)', opacity: 0.7, fontSize: '0.75rem' }}>
                            签到时间: {d.signTime}
                        </div>
                    </div>
                );
            })()}

            {/* Per-user result cards */}
            {results.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.5rem' }}>
                    {results.map((r, i) => {
                        const isOk = r.status === 'success';
                        return (
                            <div
                                key={i}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '6px',
                                    border: `1px solid ${isOk ? 'rgba(76, 175, 80, 0.5)' : 'rgba(244, 67, 54, 0.5)'}`,
                                    background: isOk ? 'rgba(76, 175, 80, 0.08)' : 'rgba(244, 67, 54, 0.08)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    textAlign: 'left'
                                }}
                            >
                                <span style={{ fontSize: '1.1rem' }}>{isOk ? '✅' : '❌'}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: isOk ? '#66bb6a' : '#ef5350', fontWeight: 600 }}>
                                        {r.username}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px', wordBreak: 'break-word' }}>
                                        {r.message || (isOk ? 'Success' : 'Failed')}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Fallback message (errors / no results) */}
            {results.length === 0 && (
                <div
                    className={`message ${status}`}
                    style={{
                        marginTop: '2rem',
                        minHeight: '4.5em',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        whiteSpace: 'pre-line'
                    }}
                >
                    {message || (loading ? 'PROCESSING...' : 'SYSTEM READY\nWAITING FOR INPUT')}
                </div>
            )}
        </div>
    );
};

export default AttendanceCodeSignIn;

