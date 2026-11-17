import { installDiagnostics } from './utils/diagnostics';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

installDiagnostics();
createRoot(document.getElementById('root')!).render(<App />);
