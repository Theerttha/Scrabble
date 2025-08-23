import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Room from "./pages/Room";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Room />} />
        <Route path="/join/:joinCode" element={<Room />} />
        <Route path="/game" element={<div style={{ 
          color: 'white', 
          textAlign: 'center', 
          marginTop: '50px',
          fontFamily: 'Courier New, monospace'
        }}>
          <h1>Game Page - Coming Soon!</h1>
          <p>The game will be implemented here.</p>
        </div>} />
      </Routes>
    </Router>
  );
}

export default App;