/**
 * 设置面板：模型接入方式与音频开关
 */
import { loadLlmConfig, saveLlmConfig, type LlmConfig } from '../config';

export interface AudioPrefs {
  bgm: boolean;
  sfx: boolean;
}

export class SettingsPanel {
  private dialog: HTMLDialogElement;
  private proxySel: HTMLSelectElement;
  private baseUrl: HTMLInputElement;
  private model: HTMLInputElement;
  private apiKey: HTMLInputElement;
  private bgmToggle: HTMLInputElement;
  private sfxToggle: HTMLInputElement;

  onSave: ((cfg: LlmConfig, audio: AudioPrefs) => void) | null = null;
  onAudioChange: ((audio: AudioPrefs) => void) | null = null;

  constructor() {
    this.dialog = document.getElementById('settings') as HTMLDialogElement;
    this.proxySel = document.getElementById('set-proxy') as HTMLSelectElement;
    this.baseUrl = document.getElementById('set-baseurl') as HTMLInputElement;
    this.model = document.getElementById('set-model') as HTMLInputElement;
    this.apiKey = document.getElementById('set-apikey') as HTMLInputElement;
    this.bgmToggle = document.getElementById('set-bgm') as HTMLInputElement;
    this.sfxToggle = document.getElementById('set-sfx') as HTMLInputElement;

    document.getElementById('btn-settings')?.addEventListener('click', () => this.open());

    document.getElementById('set-save')?.addEventListener('click', () => this.commit());
    document.getElementById('set-reset')?.addEventListener('click', () => this.reset());

    this.bgmToggle.addEventListener('change', () => this.emitAudio());
    this.sfxToggle.addEventListener('change', () => this.emitAudio());
  }

  private currentAudio(): AudioPrefs {
    return { bgm: this.bgmToggle.checked, sfx: this.sfxToggle.checked };
  }

  private emitAudio(): void {
    this.onAudioChange?.(this.currentAudio());
  }

  private fill(cfg: LlmConfig, audio: AudioPrefs): void {
    this.proxySel.value = cfg.useProxy ? 'proxy' : 'direct';
    this.baseUrl.value = cfg.baseUrl;
    this.model.value = cfg.model;
    this.apiKey.value = cfg.apiKey;
    this.bgmToggle.checked = audio.bgm;
    this.sfxToggle.checked = audio.sfx;
  }

  open(): void {
    this.fill(loadLlmConfig(), { bgm: this.bgmToggle.checked, sfx: this.sfxToggle.checked });
    this.dialog.showModal();
  }

  private commit(): void {
    const cfg: LlmConfig = {
      useProxy: this.proxySel.value === 'proxy',
      baseUrl: this.baseUrl.value.trim() || 'https://api.deepseek.com/v1',
      model: this.model.value.trim() || 'deepseek-chat',
      apiKey: this.apiKey.value.trim(),
    };
    saveLlmConfig(cfg);
    this.onSave?.(cfg, this.currentAudio());
    this.dialog.close();
  }

  private reset(): void {
    this.apiKey.value = '';
    this.proxySel.value = 'proxy';
    const cfg = loadLlmConfig();
    this.baseUrl.value = cfg.baseUrl;
    this.model.value = cfg.model;
  }
}
