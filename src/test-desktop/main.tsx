import React from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import '../../css/hyperaudio-lite-player.css';
import './styles.css';
import { DesktopStudio } from './App';

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <DesktopStudio />
  </React.StrictMode>,
);
