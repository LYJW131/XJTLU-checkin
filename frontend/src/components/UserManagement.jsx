import React, { useState, useEffect } from 'react';

const API_BASE = 'http://127.0.0.1:8000';

const UserManagement = ({ selectedUsers, setSelectedUsers }) => {
    const [users, setUsers] = useState(() => {
        try {
            const storedUsers = localStorage.getItem('managedUsers');
            if (storedUsers) return JSON.parse(storedUsers);
        } catch (e) {
            console.error(e);
        }
        return [];
    });
    const [newUsername, setNewUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [status, setStatus] = useState('');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalUsername, setModalUsername] = useState('');
    const [modalPassword, setModalPassword] = useState('');
    const [modalOtpUrl, setModalOtpUrl] = useState('');
    const [modalLoading, setModalLoading] = useState(false);
    const [modalMessage, setModalMessage] = useState('');

    // Save users to localStorage when updated
    useEffect(() => {
        localStorage.setItem('managedUsers', JSON.stringify(users));
    }, [users]);

    const handleAddUser = async (e) => {
        e.preventDefault();
        const username = newUsername.trim();

        if (!username) return;
        if (users.includes(username)) {
            setStatus('error');
            setMessage('USER ALREADY EXISTS');
            setNewUsername('');
            return;
        }

        setLoading(true);
        setMessage('VALIDATING IN DATABASE...');
        setStatus('');

        try {
            const response = await fetch(`${API_BASE}/api/users/check?username=${encodeURIComponent(username)}`);
            const data = await response.json();

            if (data.exists) {
                setUsers([...users, username]);
                setSelectedUsers([...selectedUsers, username]);
                setStatus('success');
                setMessage(`USER ${username} ADDED & VERIFIED`);
                setNewUsername('');
            } else if (data.allow_registration) {
                // User not found but registration is allowed — open modal
                setModalUsername(username);
                setModalPassword('');
                setModalOtpUrl('');
                setModalMessage('');
                setShowModal(true);
                setStatus('');
                setMessage(`USER ${username} NOT FOUND — REGISTRATION AVAILABLE`);
            } else {
                setStatus('error');
                setMessage(`USER ${username} NOT FOUND IN CONFIG`);
            }
        } catch (error) {
            setStatus('error');
            setMessage('VERIFICATION FAILED: SERVER UNREACHABLE');
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async () => {
        if (!modalPassword.trim() || !modalOtpUrl.trim()) {
            setModalMessage('All fields are required.');
            return;
        }

        setModalLoading(true);
        setModalMessage('Verifying credentials via login...');

        try {
            const response = await fetch(`${API_BASE}/api/users/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: modalUsername,
                    password: modalPassword,
                    otp_url: modalOtpUrl
                })
            });
            const data = await response.json();

            if (response.ok && data.success) {
                setUsers(prev => [...prev, modalUsername]);
                setSelectedUsers(prev => [...prev, modalUsername]);
                setStatus('success');
                setMessage(`USER ${modalUsername} REGISTERED & ADDED`);
                setNewUsername('');
                setShowModal(false);
            } else {
                setModalMessage(data.message || data.detail || 'Registration failed.');
            }
        } catch (error) {
            setModalMessage('SERVER UNREACHABLE');
        } finally {
            setModalLoading(false);
        }
    };

    const handleRemoveUser = (userToRemove) => {
        setUsers(users.filter(u => u !== userToRemove));
        setSelectedUsers(selectedUsers.filter(u => u !== userToRemove));
    };

    const handleToggleUser = (username) => {
        if (selectedUsers.includes(username)) {
            setSelectedUsers(selectedUsers.filter(u => u !== username));
        } else {
            setSelectedUsers([...selectedUsers, username]);
        }
    };

    return (
        <div className="card">
            <h2>USER MANAGEMENT</h2>

            <form onSubmit={handleAddUser}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
                    <input
                        type="text"
                        placeholder="ENTER USERNAME"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        disabled={loading}
                        style={{ flex: 1, marginBottom: 0 }}
                    />
                    <button
                        type="submit"
                        disabled={loading || !newUsername.trim()}
                        style={{ width: 'auto', padding: '0 20px' }}
                    >
                        {loading ? '...' : 'ADD'}
                    </button>
                </div>
            </form>

            <div
                className={`message ${status}`}
                style={{
                    marginBottom: '1rem',
                    minHeight: '2em',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    fontSize: '0.8rem'
                }}
            >
                {message || 'READY TO MANAGE USERS'}
            </div>

            <div style={{ marginTop: '2rem' }}>
                <h3 style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '1rem' }}>ACTIVE USERS ({users.length})</h3>
                <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '1rem' }}>Selected users will be processed during sign-in.</p>

                {users.length === 0 ? (
                    <div style={{ opacity: 0.5, textAlign: 'center', padding: '1rem 0' }}>NO USERS CONFIGURED</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {users.map(username => (
                            <div
                                key={username}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px 15px',
                                    margin: '0 0 8px 0',
                                    background: selectedUsers.includes(username)
                                        ? 'rgba(255, 183, 77, 0.15)'
                                        : 'rgba(255, 255, 255, 0.05)',
                                    borderRadius: '6px',
                                    border: selectedUsers.includes(username)
                                        ? '1px solid var(--gold-primary)'
                                        : '1px solid rgba(255, 255, 255, 0.1)',
                                    boxShadow: selectedUsers.includes(username)
                                        ? '0 0 12px rgba(255, 183, 77, 0.15)'
                                        : 'none',
                                    transition: 'all 0.2s ease',
                                    boxSizing: 'border-box'
                                }}
                            >
                                <div
                                    style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1, gap: '15px' }}
                                    onClick={() => handleToggleUser(username)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedUsers.includes(username)}
                                        onChange={() => { }} // handled by div click
                                        style={{ width: 'auto', margin: 0, padding: 0 }}
                                    />
                                    <span style={{ fontFamily: 'monospace', paddingTop: '2px' }}>{username}</span>
                                </div>
                                <button
                                    onClick={() => handleRemoveUser(username)}
                                    style={{
                                        width: 'auto',
                                        padding: '5px 10px',
                                        fontSize: '0.7rem',
                                        background: 'rgba(255,50,50,0.2)',
                                        color: '#ff6b6b'
                                    }}
                                >
                                    REMOVE
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Registration Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => !modalLoading && setShowModal(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '0.5rem', color: 'var(--gold-primary)' }}>REGISTER NEW USER</h3>
                        <p style={{ fontSize: '0.85rem', opacity: 0.8, marginBottom: '1.5rem' }}>
                            User <strong style={{ color: 'var(--gold-primary)' }}>{modalUsername}</strong> was not found. Enter credentials to register.
                        </p>

                        <div className="modal-warning">
                            ⚠️ Your credentials (password & OTP secret) will be stored on the backend server in plaintext. Only proceed if you trust the server operator.
                        </div>

                        <label className="modal-label">Password</label>
                        <input
                            type="password"
                            placeholder="Enter password"
                            value={modalPassword}
                            onChange={(e) => setModalPassword(e.target.value)}
                            disabled={modalLoading}
                            style={{ marginBottom: '0.75rem' }}
                        />

                        <label className="modal-label">OTP URL</label>
                        <input
                            type="text"
                            placeholder="otpauth://totp/..."
                            value={modalOtpUrl}
                            onChange={(e) => setModalOtpUrl(e.target.value)}
                            disabled={modalLoading}
                            style={{ marginBottom: '1rem' }}
                        />

                        {modalMessage && (
                            <div style={{
                                padding: '8px 12px',
                                marginBottom: '1rem',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                background: 'rgba(255,50,50,0.1)',
                                color: '#ff6b6b',
                                border: '1px solid rgba(255,50,50,0.3)'
                            }}>
                                {modalMessage}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowModal(false)}
                                disabled={modalLoading}
                                style={{
                                    width: 'auto',
                                    padding: '8px 20px',
                                    background: 'rgba(255,255,255,0.1)',
                                    color: 'var(--text-secondary)'
                                }}
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={handleRegister}
                                disabled={modalLoading || !modalPassword.trim() || !modalOtpUrl.trim()}
                                style={{ width: 'auto', padding: '8px 20px' }}
                            >
                                {modalLoading ? (
                                    <><span className="spinner"></span>VERIFYING...</>
                                ) : 'CONFIRM & LOGIN'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;
