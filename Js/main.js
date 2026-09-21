import { TitleScene } from './titleScene.js';
import { ScreenManager, bindActions } from './ui.js';
import { loadSettings, saveSettings } from './settings.js';
import { VERSION } from './config.js';

const settings = loadSettings();
const screens = new ScreenManager();
const title = new TitleScene(document.getElementById('bg'), settings);
title.start();

document.getElementById('version').textContent = 'v' + VERSION;

// Settings controls
const volume = document.getElementById('set-volume');
const shadows = document.getElementById('set-shadows');
volume.value = settings.masterVolume;
shadows.checked = settings.shadows;
volume.addEventListener('input', () => { settings.masterVolume = Number(volume.value); saveSettings(settings); });
shadows.addEventListener('change', () => { settings.shadows = shadows.checked; saveSettings(settings); title.setShadows(settings.shadows); });

// Menu actions
bindActions(document.getElementById('ui'), {
  newGame: () => screens.show('character'), // Milestone 2 replaces this screen
  settings: () => screens.show('settings'),
  exit: () => { window.close(); screens.show('exit'); },
  back: () => screens.show('title'),
});

screens.show('title');
