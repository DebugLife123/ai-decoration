import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import WorkspacePage from './pages/WorkspacePage';
import BusinessPage from './pages/BusinessPage';
import './App.css';

function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/business" element={<BusinessPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
