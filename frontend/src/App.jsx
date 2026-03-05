import React, { useState, useEffect } from 'react';
import QRCodeSignIn from './components/QRCodeSignIn';
import AttendanceCodeSignIn from './components/AttendanceCodeSignIn';
import UserManagement from './components/UserManagement';

function App() {
  const [activeTab, setActiveTab] = useState('qrcode');
  const [selectedUsers, setSelectedUsers] = useState(() => {
    try {
      const storedSelected = localStorage.getItem('selectedUsers');
      if (storedSelected) {
        return JSON.parse(storedSelected);
      }
      const storedUsers = localStorage.getItem('managedUsers');
      if (storedUsers) {
        return JSON.parse(storedUsers);
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('selectedUsers', JSON.stringify(selectedUsers));
  }, [selectedUsers]);

  // Handle initial hash and hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove '#'
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
            <UserManagement selectedUsers={selectedUsers} setSelectedUsers={setSelectedUsers} />
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
