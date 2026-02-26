import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import PlayerPage from './pages/PlayerPage';
import PlaylistPage from './pages/PlaylistPage';
import EPGPage from './pages/EPGPage';
import SettingsPage from './pages/SettingsPage';
import './App.css';

export const AppContext = React.createContext();

export default function App() {
  const [channels, setChannels] = useState(() => {
    try { return JSON.parse(localStorage.getItem('iptv_channels') || '[]'); } catch { return []; }
  });
  const [currentChannel, setCurrentChannel] = useState(null);
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('iptv_favorites') || '[]'); } catch { return []; }
  });
  const [playlists, setPlaylists] = useState(() => {
    try { return JSON.parse(localStorage.getItem('iptv_playlists') || '[]'); } catch { return []; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [apiBase] = useState(process.env.REACT_APP_API_URL || '');

  useEffect(() => {
    localStorage.setItem('iptv_channels', JSON.stringify(channels));
  }, [channels]);

  useEffect(() => {
    localStorage.setItem('iptv_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('iptv_playlists', JSON.stringify(playlists));
  }, [playlists]);

  const toggleFavorite = (channel) => {
    setFavorites(prev => {
      const exists = prev.find(f => f.url === channel.url);
      return exists ? prev.filter(f => f.url !== channel.url) : [...prev, channel];
    });
  };

  const isFavorite = (channel) => favorites.some(f => f.url === channel?.url);

  return (
    <AppContext.Provider value={{
      channels, setChannels,
      currentChannel, setCurrentChannel,
      favorites, toggleFavorite, isFavorite,
      playlists, setPlaylists,
      sidebarOpen, setSidebarOpen,
      apiBase
    }}>
      <Router>
        <div className="app-shell">
          <Sidebar />
          <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
            <Routes>
              <Route path="/" element={<PlayerPage />} />
              <Route path="/playlists" element={<PlaylistPage />} />
              <Route path="/epg" element={<EPGPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </Router>
    </AppContext.Provider>
  );
}
