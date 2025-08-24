import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Room from "./pages/Room";
import Game from "./pages/Game"

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Room />} />
        <Route path="/join/:joinCode" element={<Room />} />
        <Route path="/game" element={<Game />} />

      </Routes>
    </Router>
  );
}

export default App;