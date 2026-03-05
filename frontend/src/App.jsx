import React, { useState, useEffect } from 'react';
import QRCodeSignIn from './components/QRCodeSignIn';
import AttendanceCodeSignIn from './components/AttendanceCodeSignIn';
import UserManagement from './components/UserManagement';

function App() {
  const [activeTab, setActiveTab] = useState('qrcode');
  const [users, setUsers] = useState(() => {
    try {
      const storedUsers = localStorage.getItem('managedUsers');
      if (storedUsers) return JSON.parse(storedUsers);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const [selectedUsers, setSelectedUsers] = useState(() => {
    try {
      const storedSelected = localStorage.getItem('selectedUsers');
      if (storedSelected) {
        return JSON.parse(storedSelected);
      }
      return [];
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  // Save users to localStorage when updated
  useEffect(() => {
    localStorage.setItem('managedUsers', JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem('selectedUsers', JSON.stringify(selectedUsers));
  }, [selectedUsers]);

  // Handle initial hash and hash changes
  useEffect(() => {
    const handleHashChange = async () => {
      const hash = window.location.hash.slice(1); // Remove '#'

      // Import logic: #import:user1,user2,user3
      if (hash.startsWith('import:')) {
        const rawList = hash.substring(7);
        if (rawList) {
          const candidates = rawList.split(',').map(u => u.trim()).filter(u => u !== '');
          if (candidates.length > 0) {
            const verified = [];
            const failed = [];

            for (const username of candidates) {
              try {
                const response = await fetch(`/api/users/check?username=${encodeURIComponent(username)}`);
                const data = await response.json();
                if (data.exists) {
                  verified.push(username);
                } else {
                  failed.push(username);
                }
              } catch (e) {
                failed.push(username);
              }
            }

            if (verified.length > 0) {
              // Merge into managed users
              setUsers(prev => {
                const next = [...prev];
                verified.forEach(u => {
                  if (!next.includes(u)) next.push(u);
                });
                return next;
              });
              // Auto-select them
              setSelectedUsers(prev => {
                const next = [...prev];
                verified.forEach(u => {
                  if (!next.includes(u)) next.push(u);
                });
                return next;
              });
            }

            // Move to users tab
            setActiveTab('users');
            window.location.hash = 'users';

            let report = `VERIFIED & IMPORTED ${verified.length} USERS.`;
            if (failed.length > 0) {
              report += `\nFAILED (NOT IN CONFIG): ${failed.join(', ')}`;
            }
            alert(report);
            return;
          }
        }
      }

      if (hash === 'code') {
        setActiveTab('code');
      } else if (hash === 'users') {
        setActiveTab('users');
      } else {
        setActiveTab('qrcode');
      }
    };

    // Check initial hash
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'qrcode') {
      window.location.hash = 'qrcode';
    } else {
      window.location.hash = tab;
    }
  };

  return (
    <>
      <h1>XJTLU // SYSTEM ACCESS</h1>
      <div className="tabs">
        <button
          className={`tab-btn ${activeTab === 'qrcode' ? 'active' : ''}`}
          onClick={() => handleTabChange('qrcode')}
        >
          QR SCAN
        </button>
        <button
          className={`tab-btn ${activeTab === 'code' ? 'active' : ''}`}
          onClick={() => handleTabChange('code')}
        >
          CODE INPUT
        </button>
        <button
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => handleTabChange('users')}
        >
          USERS
        </button>
      </div>

      <div className="container">

        <div className="content">
          <div style={{ display: activeTab === 'qrcode' ? 'block' : 'none' }}>
            <QRCodeSignIn isActive={activeTab === 'qrcode'} selectedUsers={selectedUsers} />
          </div>
          <div style={{ display: activeTab === 'code' ? 'block' : 'none' }}>
            <AttendanceCodeSignIn selectedUsers={selectedUsers} />
          </div>
          <div style={{ display: activeTab === 'users' ? 'block' : 'none' }}>
            <UserManagement
              users={users}
              setUsers={setUsers}
              selectedUsers={selectedUsers}
              setSelectedUsers={setSelectedUsers}
            />
          </div>
        </div>
      </div>

      <footer className="footer">
        <a
          href="https://github.com/LYJW131/XJTLU-checkin"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="github-icon">
            <path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"></path>
          </svg>
          GITHUB // XJTLU-checkin
        </a>
      </footer>
    </>
  );
}

export default App;
