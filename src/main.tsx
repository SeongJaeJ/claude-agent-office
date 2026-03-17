import { createRoot } from 'react-dom/client';
import App from './App';

// StrictMode 제거: WebSocket/PTY 터미널 등 부수효과가 많은 앱에서
// 이중 마운트가 연결 중복 + 터미널 파괴를 일으킴
createRoot(document.getElementById('root')!).render(<App />);
