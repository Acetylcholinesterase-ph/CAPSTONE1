import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import StudentPortal from './components/StudentPortal';
import AdminMonitoring from './components/AdminMonitoring';
import Navbar from './components/Navbar';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Navbar />
        <div className="container">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/student" element={<StudentPortal />} />
            <Route path="/admin" element={<AdminMonitoring />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App; 