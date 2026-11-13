/**
 * 语音输入（Web Speech API）
 * 浏览器原生能力，无需额外密钥；不支持的浏览器自动隐藏入口。
 */
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

type SpeechCtor = new () => SpeechRecognitionLike;

export class SpeechInput {
  private recognition: SpeechRecognitionLike | null = null;
  private listening = false;

  private get ctor(): SpeechCtor | null {
    const w = window as unknown as {
      SpeechRecognition?: SpeechCtor;
      webkitSpeechRecognition?: SpeechCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }

  get supported(): boolean {
    return this.ctor !== null;
  }

  get isListening(): boolean {
    return this.listening;
  }

  start(onResult: (text: string) => void, onEnd: () => void): void {
    const Ctor = this.ctor;
    if (!Ctor || this.listening) return;

    const rec = new Ctor();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (ev) => {
      const text = ev.results[0]?.[0]?.transcript ?? '';
      if (text) onResult(text.trim());
    };
    rec.onerror = () => {
      this.listening = false;
      onEnd();
    };
    rec.onend = () => {
      this.listening = false;
      onEnd();
    };

    try {
      rec.start();
      this.recognition = rec;
      this.listening = true;
    } catch {
      this.listening = false;
      onEnd();
    }
  }

  stop(): void {
    this.recognition?.stop();
    this.listening = false;
  }
}
