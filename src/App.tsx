import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import InspirationPage from './pages/InspirationPage';
import WorkspacePage from './pages/WorkspacePage';
import BusinessPage from './pages/BusinessPage';
import CadWorkflowPage from './pages/CadWorkflowPage';
import './App.css';

function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/inspiration" element={<InspirationPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/business" element={<BusinessPage />} />
          <Route path="/cad-workflow" element={<CadWorkflowPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
