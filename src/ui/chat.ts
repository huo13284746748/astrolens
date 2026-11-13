/**
 * 对话面板：负责消息渲染、流式追加、引用来源与模式标识
 */
export interface AiMessageHandle {
  append: (text: string) => void;
  setCitations: (titles: string[]) => void;
  finish: () => void;
}

export class ChatPanel {
  private body: HTMLElement;
  private form: HTMLFormElement;
  private input: HTMLInputElement;
  private sendBtn: HTMLButtonElement;
  private modeChip: HTMLElement;
  private chips: HTMLElement;
  private panel: HTMLElement;

  onAsk: ((question: string) => void) | null = null;

  constructor() {
    this.panel = document.getElementById('chat') as HTMLElement;
    this.body = document.getElementById('chat-body') as HTMLElement;
    this.form = document.getElementById('ask-form') as HTMLFormElement;
    this.input = document.getElementById('ask-input') as HTMLInputElement;
    this.sendBtn = document.getElementById('btn-send') as HTMLButtonElement;
    this.modeChip = document.getElementById('mode-chip') as HTMLElement;
    this.chips = document.getElementById('chips') as HTMLElement;

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });

    this.chips.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.chip');
      if (!btn) return;
      const q = btn.dataset.q;
      if (q) this.ask(q);
    });

    document.getElementById('btn-collapse')?.addEventListener('click', () => {
      this.panel.classList.toggle('is-collapsed');
    });
  }

  private submit(): void {
    const q = this.input.value.trim();
    if (!q) return;
    this.input.value = '';
    this.ask(q);
  }

  private ask(q: string): void {
    this.chips.style.display = 'none';
    this.onAsk?.(q);
  }

  setBusy(busy: boolean): void {
    this.sendBtn.disabled = busy;
    this.sendBtn.textContent = busy ? '思考中' : '发送';
  }

  setMode(offline: boolean, note = ''): void {
    this.modeChip.textContent = offline ? '本地' : '模型';
    this.modeChip.classList.toggle('is-offline', offline);
    this.modeChip.title = note || (offline ? '未连接大模型，使用本地知识库' : '已连接大模型');
  }

  addUserMessage(text: string): void {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg--user';
    const bubble = document.createElement('div');
    bubble.className = 'msg__bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    this.body.appendChild(wrap);
    this.scroll();
  }

  addErrorMessage(text: string): void {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg--error';
    const bubble = document.createElement('div');
    bubble.className = 'msg__bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    this.body.appendChild(wrap);
    this.scroll();
  }

  createAiMessage(): AiMessageHandle {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg--ai';

    const container = document.createElement('div');
    const bubble = document.createElement('div');
    bubble.className = 'msg__bubble is-streaming';
    bubble.textContent = '';

    const cites = document.createElement('div');
    cites.className = 'msg__cites';

    container.appendChild(bubble);
    container.appendChild(cites);
    wrap.appendChild(container);
    this.body.appendChild(wrap);
    this.scroll();

    let buffer = '';

    return {
      append: (text: string) => {
        buffer += text;
        bubble.textContent = buffer;
        this.scroll();
      },
      setCitations: (titles: string[]) => {
        cites.innerHTML = '';
        for (const t of titles.slice(0, 3)) {
          const span = document.createElement('span');
          span.className = 'cite';
          span.textContent = `来源 · ${t}`;
          cites.appendChild(span);
        }
      },
      finish: () => {
        bubble.classList.remove('is-streaming');
        this.scroll();
      },
    };
  }

  private scroll(): void {
    this.body.scrollTop = this.body.scrollHeight;
  }
}
