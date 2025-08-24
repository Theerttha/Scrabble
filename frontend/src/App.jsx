import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Room from "./pages/Room";
import Game from "./pages/Game";
import './App.css'; // Make sure to import your CSS

function App() {
  return (
    <div className="app-container">
      <Router>
        <Routes>
          <Route path="/" element={<Room />} />
          <Route path="/join/:joinCode" element={<Room />} />
          <Route path="/game" element={<Game />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;