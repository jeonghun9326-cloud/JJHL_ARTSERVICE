// 오디오 클리너 페이지 — 보컬/반주 2트랙을 각각 업로드해서 리퍼/큐베이스처럼 트랙별로
// 재생(뮤트/솔로)해보고, 트랙마다 EQ·치찰음 억제(De-esser)·노이즈 게이트·컴프레서·볼륨을
// 적용한 뒤 하나로 믹스해 WAV로 내보낸다. 전부 브라우저 Web Audio API로 처리해서 서버가 필요 없다.
//
// 원래는 로컬 AI 노이즈 제거 서버(JJHL_NOISE)를 호출하는 "완전자동" 모드도 있었지만,
// 그 서버는 항상 방문자 자신의 PC에서 실행돼야 해서 배포된 사이트에서는 사이트 운영자
// 본인 외에는 아무도 쓸 수 없었다 — 그래서 제거했다. 여기 있는 노이즈 게이트는 AI 기반
// 노이즈 제거가 아니라 "조용한 구간의 소리를 줄이는" 전통적인 방식이다(자세한 설명은 아래).
(function () {
  const EQ_BANDS = [60, 170, 350, 1000, 3500, 10000];
  const EQ_BAND_DESC = [
    '60Hz · 가장 낮은 저음. 무게감/두께감. 너무 올리면 먹먹해질 수 있어요.',
    '170Hz · 저음~중저음. 목소리·악기의 두께. 너무 올리면 웅웅거려요(boxy).',
    '350Hz · 중저음. 답답하고 탁한 느낌이 여기서 생겨요. 살짝 깎으면 깔끔해지는 경우가 많아요.',
    '1kHz · 중음. 소리의 존재감. 너무 올리면 코맹맹이 소리가 나요.',
    '3.5kHz · 고음 시작. 명료도/또렷함. 과하게 올리면 거칠어져요.',
    '10kHz · 가장 높은 고음. 공기감/광택. 치찰음("스", "츠" 발음)이 거슬리면 여기를 낮춰보세요.',
  ];

  const COMP_SPECS = [
    {
      key: 'threshold',
      label: '임계값(threshold)',
      min: -60,
      max: 0,
      step: 1,
      value: -24,
      unit: 'dB',
      desc: '이 음량보다 큰 소리만 압축(줄이기)을 시작합니다. 낮출수록 더 많은 소리가 압축돼요.',
    },
    {
      key: 'ratio',
      label: '비율(ratio)',
      min: 1,
      max: 20,
      step: 1,
      value: 4,
      unit: ':1',
      desc: '압축 강도예요. 4:1이면 임계값을 넘은 만큼을 1/4로 줄입니다. 숫자가 클수록 세게 눌러요.',
    },
    {
      key: 'attack',
      label: '어택(attack)',
      min: 0,
      max: 1,
      step: 0.001,
      value: 0.003,
      unit: 's',
      desc: '소리가 커진 뒤 압축이 시작되기까지 걸리는 시간이에요. 너무 짧으면 타격감까지 눌려버려요.',
    },
    {
      key: 'release',
      label: '릴리즈(release)',
      min: 0,
      max: 1,
      step: 0.01,
      value: 0.25,
      unit: 's',
      desc: '압축이 풀리는 데 걸리는 시간이에요. 너무 짧으면 소리가 들썩이는 "펌핑" 현상이 생길 수 있어요.',
    },
  ];

  // 노이즈 게이트: AI가 아니라 "이 음량보다 작으면 줄인다"는 단순한 방식이다. 노래/연주가 나오는
  // 구간은 건드리지 않고, 조용한 구간(숨소리, 배경 잡음, 녹음실 노이즈 등)만 낮춰준다.
  const GATE_SPECS = [
    {
      key: 'gateThresholdDb',
      label: '임계값(threshold)',
      min: -80,
      max: -10,
      step: 1,
      value: -50,
      unit: 'dB',
      desc: '이 음량보다 작은 소리를 "잡음"으로 판단합니다. 낮출수록 아주 작은 소리만 잡음으로 처리해요.',
    },
    {
      key: 'gateReductionDb',
      label: '감소량(reduction)',
      min: -40,
      max: 0,
      step: 1,
      value: 0,
      unit: 'dB',
      desc: '잡음으로 판단된 구간을 얼마나 줄일지 정합니다. 0이면 효과 없음, 낮출수록 확실히 조용해져요.',
    },
  ];

  // 치찰음 억제(De-esser): "스", "츠", "시" 발음처럼 특정 고음 대역이 날카롭게 튀는 것만
  // 골라서 눌러준다. 그 대역만 압축하고 나머지 소리는 그대로 둔다.
  const DEESS_SPECS = [
    {
      key: 'deEssFreq',
      label: '주파수(frequency)',
      min: 3000,
      max: 10000,
      step: 100,
      value: 6500,
      unit: 'Hz',
      desc: '치찰음이 몰려있는 주파수예요. 목소리가 높으면 오른쪽(높게), 낮으면 왼쪽(낮게)으로 옮겨보세요.',
    },
    {
      key: 'deEssAmount',
      label: '억제 강도(amount)',
      min: 0,
      max: 100,
      step: 5,
      value: 0,
      unit: '%',
      desc: '억제 강도예요. 0이면 효과 없음, 높일수록 치찰음이 부드러워지지만 너무 높이면 발음이 뭉개질 수 있어요.',
    },
  ];

  // 프리셋은 보컬/반주에 각각 다르게 적용된다(예: 보컬을 또렷하게 할 땐 반주를 살짝 비켜준다).
  const PRESETS = {
    flat: {
      vocal: {
        eq: [0, 0, 0, 0, 0, 0],
        comp: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
        gain: 0,
        deEssAmount: 0,
        gateReductionDb: 0,
      },
      inst: {
        eq: [0, 0, 0, 0, 0, 0],
        comp: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
        gain: 0,
        deEssAmount: 0,
        gateReductionDb: 0,
      },
    },
    vocalClear: {
      vocal: {
        eq: [-2, -1, 0, 2, 3.5, 1],
        comp: { threshold: -22, ratio: 3, attack: 0.005, release: 0.2 },
        gain: 1,
        deEssAmount: 35,
        gateReductionDb: -10,
      },
      inst: {
        eq: [0, 0, -1.5, -2, -1, 0],
        comp: { threshold: -24, ratio: 3, attack: 0.005, release: 0.2 },
        gain: -1,
        deEssAmount: 0,
        gateReductionDb: 0,
      },
    },
    bassBoost: {
      vocal: {
        eq: [1, 1, 0, 0, 0, 0],
        comp: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
        gain: 0,
        deEssAmount: 0,
        gateReductionDb: 0,
      },
      inst: {
        eq: [3.5, 2.5, 0, 0, 0, 0],
        comp: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
        gain: 0.5,
        deEssAmount: 0,
        gateReductionDb: 0,
      },
    },
    loud: {
      vocal: {
        eq: [0.5, 0, 0, 1, 1.5, 1],
        comp: { threshold: -28, ratio: 5, attack: 0.002, release: 0.15 },
        gain: 2,
        deEssAmount: 25,
        gateReductionDb: -12,
      },
      inst: {
        eq: [0.5, 0, 0, 0.5, 1, 0.5],
        comp: { threshold: -30, ratio: 6, attack: 0.002, release: 0.15 },
        gain: 1.5,
        deEssAmount: 0,
        gateReductionDb: -8,
      },
    },
  };

  const TRACK_DEFS = [
    { key: 'vocal', label: '🎤 보컬', inputId: 'vocalFileInput' },
    { key: 'inst', label: '🎹 반주', inputId: 'instFileInput' },
  ];

  function gainFromDb(db) {
    return Math.pow(10, db / 20);
  }
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /**
   * 노이즈 게이트 노드를 만든다. Web Audio에는 게이트 내장 노드가 없어서
   * ScriptProcessorNode(구형이지만 모든 브라우저에서 여전히 동작함)로 직접 구현한다.
   * envelope(레벨 추적) → 임계값 비교 → gain(스무딩 포함)의 2단계로 처리해 클릭음을 방지한다.
   * 채널마다 독립적으로 계산해 스테레오 신호가 왜곡되지 않게 한다.
   */
  function createNoiseGateNode(ctx, numChannels, thresholdDb, reductionDb) {
    const bufferSize = 1024;
    const node = ctx.createScriptProcessor(bufferSize, numChannels, numChannels);
    const state = {
      thresholdLin: gainFromDb(thresholdDb),
      reductionLin: gainFromDb(reductionDb),
      envelope: new Array(numChannels).fill(0),
      gain: new Array(numChannels).fill(1),
    };
    const envAttack = Math.exp(-1 / (ctx.sampleRate * 0.005));
    const envRelease = Math.exp(-1 / (ctx.sampleRate * 0.15));
    const gainAttack = Math.exp(-1 / (ctx.sampleRate * 0.005));
    const gainRelease = Math.exp(-1 / (ctx.sampleRate * 0.15));

    node.onaudioprocess = (e) => {
      const chCount = Math.min(e.inputBuffer.numberOfChannels, e.outputBuffer.numberOfChannels, numChannels);
      for (let ch = 0; ch < chCount; ch++) {
        const input = e.inputBuffer.getChannelData(ch);
        const output = e.outputBuffer.getChannelData(ch);
        let env = state.envelope[ch];
        let g = state.gain[ch];
        for (let i = 0; i < input.length; i++) {
          const rectified = Math.abs(input[i]);
          const envCoeff = rectified > env ? envAttack : envRelease;
          env = envCoeff * env + (1 - envCoeff) * rectified;
          const targetGain = env < state.thresholdLin ? state.reductionLin : 1;
          const gCoeff = targetGain < g ? gainAttack : gainRelease;
          g = gCoeff * g + (1 - gCoeff) * targetGain;
          output[i] = input[i] * g;
        }
        state.envelope[ch] = env;
        state.gain[ch] = g;
      }
    };
    node._gateState = state;
    return node;
  }

  /**
   * 트랙 하나의 처리 체인을 만든다. 라이브 재생(AudioContext)과 내보내기(OfflineAudioContext)
   * 양쪽에서 재사용한다 — 두 곳에서 서로 다른 결과가 나오지 않도록 로직을 한 곳에 모아둔다.
   *
   * 신호 흐름: 노이즈 게이트 → EQ(6밴드) → 치찰음 억제(대역만 따로 압축 후 합침) → 컴프레서
   *
   * 치찰음 억제는 전용 노드가 없어서, 목표 대역만 bandpass로 떼어내 압축한 뒤 나머지
   * 대역(notch로 그 부분만 뺀 원신호)과 다시 합치는 방식(split-band de-essing)으로 구현했다.
   */
  function buildProcessingChain(ctx, track, options) {
    const bypass = !!(options && options.bypass);
    const numChannels = track.buffer ? track.buffer.numberOfChannels : 2;

    const gateNode = createNoiseGateNode(
      ctx,
      numChannels,
      bypass ? -80 : track.gateThresholdDb,
      bypass ? 0 : track.gateReductionDb,
    );

    const eqNodes = EQ_BANDS.map((freq, i) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1;
      f.gain.value = bypass ? 0 : track.eqValues[i];
      return f;
    });

    const deEssBandpass = ctx.createBiquadFilter();
    deEssBandpass.type = 'bandpass';
    deEssBandpass.frequency.value = track.deEssFreq;
    deEssBandpass.Q.value = 1.4;

    const deEssNotch = ctx.createBiquadFilter();
    deEssNotch.type = 'notch';
    deEssNotch.frequency.value = track.deEssFreq;
    deEssNotch.Q.value = 1.4;

    const deEssComp = ctx.createDynamicsCompressor();
    const deEssAmount = bypass ? 0 : track.deEssAmount;
    deEssComp.threshold.value = -deEssAmount * 0.4;
    deEssComp.ratio.value = 1 + deEssAmount * 0.11;
    deEssComp.attack.value = 0.001;
    deEssComp.release.value = 0.05;

    const deEssMerge = ctx.createGain();

    const compNode = ctx.createDynamicsCompressor();
    if (bypass) {
      compNode.threshold.value = 0;
      compNode.ratio.value = 1;
    } else {
      Object.entries(track.compValues).forEach(([k, v]) => {
        compNode[k].value = v;
      });
    }

    let node = gateNode;
    eqNodes.forEach((eq) => {
      node.connect(eq);
      node = eq;
    });
    // node === 마지막 EQ 밴드. 여기서 갈라져서 치찰음 대역만 압축한 뒤 다시 합쳐진다.
    node.connect(deEssBandpass);
    node.connect(deEssNotch);
    deEssBandpass.connect(deEssComp);
    deEssComp.connect(deEssMerge);
    deEssNotch.connect(deEssMerge);
    deEssMerge.connect(compNode);

    return { entry: gateNode, eqNodes, gateNode, deEssBandpass, deEssNotch, deEssComp, compNode, output: compNode };
  }

  function initManualMode() {
    const tracksContainer = document.getElementById('acTracks');
    const transportEl = document.getElementById('acTransport');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const timeDisplay = document.getElementById('timeDisplay');
    const bypassToggle = document.getElementById('bypassToggle');
    const outputGainInput = document.getElementById('outputGain');
    const outputGainVal = document.getElementById('outputGainVal');
    const exportBtn = document.getElementById('manualExportBtn');
    const exportStatus = document.getElementById('manualExportStatus');
    const presetsEl = document.getElementById('acPresets');

    /** @type {Record<string, any>} */
    const tracks = {};
    let audioCtx = null;
    let masterGain = null;

    const playState = { playing: false, startCtxTime: 0, offset: 0, rafId: null };

    function ensureAudioCtx() {
      if (audioCtx) return audioCtx;
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = gainFromDb(Number(outputGainInput.value));
      masterGain.connect(audioCtx.destination);
      return audioCtx;
    }

    // 소수점 뒤 불필요한 0을 정리해서 표시용 문자열로 바꾼다 (0.250 -> "0.25", 4.000 -> "4").
    function formatNumberValue(v, decimals) {
      return String(parseFloat(v.toFixed(decimals)));
    }

    // 드래그(range)와 직접 입력(number) 두 인풋을 만들어 서로 값을 동기화한다.
    // 둘 중 어느 쪽으로 값이 바뀌어도 동일한 setValue()를 거쳐 상태/오디오 노드/반대쪽 입력에 반영된다.
    function createPairedInputs({ min, max, step, value, decimals = 2, dataKey, onChange }) {
      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(min);
      range.max = String(max);
      range.step = String(step);
      range.value = String(value);
      if (dataKey) range.dataset.key = dataKey;

      const number = document.createElement('input');
      number.type = 'number';
      number.className = 'ac-num-input';
      number.min = String(min);
      number.max = String(max);
      number.step = String(step);
      number.value = formatNumberValue(value, decimals);

      function setValue(raw, source) {
        const v = Math.min(max, Math.max(min, raw));
        range.value = String(v);
        // 숫자 입력창에서 온 값이 범위를 벗어나 보정됐다면(v !== raw) 입력창도 보정된 값으로 되돌린다.
        // 범위 안의 값이면 굳이 다시 쓰지 않아 타이핑 중 커서 위치가 안 흐트러지게 한다.
        if (source !== 'number' || v !== raw) number.value = formatNumberValue(v, decimals);
        onChange(v);
      }

      range.addEventListener('input', () => setValue(Number(range.value), 'range'));
      number.addEventListener('input', () => {
        const v = Number(number.value);
        if (Number.isNaN(v)) return;
        setValue(v, 'number');
      });
      // 입력 도중(빈 값, "-"만 입력 등) 포커스를 벗어나면 마지막 유효 값으로 되돌린다.
      number.addEventListener('blur', () => setValue(Number(range.value), 'number'));

      return { range, number };
    }

    // ─────────────────────────── 공용 슬라이더 그리드 생성 ───────────────────────────
    function buildSliderGrid(container, specs, valuesObj, onChange) {
      container.innerHTML = '';
      specs.forEach((spec) => {
        const row = document.createElement('div');
        row.className = 'ac-slider-row';
        row.title = spec.desc;
        const labelRow = document.createElement('div');
        labelRow.className = 'ac-slider-label';
        const name = document.createElement('span');
        name.textContent = spec.label;
        const unitLabel = document.createElement('span');
        unitLabel.className = 'ac-unit-label';
        unitLabel.textContent = spec.unit;

        const { range, number } = createPairedInputs({
          min: spec.min,
          max: spec.max,
          step: spec.step,
          value: spec.value,
          decimals: spec.step < 1 ? 3 : 0,
          dataKey: spec.key,
          onChange: (v) => {
            valuesObj[spec.key] = v;
            onChange(spec.key, v);
          },
        });

        labelRow.appendChild(name);
        const valueWrap = document.createElement('span');
        valueWrap.className = 'ac-value-wrap';
        valueWrap.appendChild(number);
        valueWrap.appendChild(unitLabel);
        labelRow.appendChild(valueWrap);
        row.appendChild(labelRow);
        row.appendChild(range);
        container.appendChild(row);
      });
    }

    function buildEqGrid(track) {
      track.eqSlidersEl.innerHTML = '';
      EQ_BANDS.forEach((freq, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'ac-eq-band';
        wrap.title = EQ_BAND_DESC[i];

        const { range, number } = createPairedInputs({
          min: -12,
          max: 12,
          step: 0.5,
          value: 0,
          decimals: 1,
          dataKey: String(i),
          onChange: (db) => {
            track.eqValues[i] = db;
            if (track.eqNodes[i]) track.eqNodes[i].gain.value = db;
          },
        });
        range.dataset.bandIndex = String(i);

        const freqLabel = document.createElement('span');
        freqLabel.className = 'ac-eq-freq';
        freqLabel.textContent = freq >= 1000 ? `${freq / 1000}k` : String(freq);
        wrap.appendChild(number);
        wrap.appendChild(range);
        wrap.appendChild(freqLabel);
        track.eqSlidersEl.appendChild(wrap);
      });
    }

    function buildCompGrid(track) {
      buildSliderGrid(track.compControlsEl, COMP_SPECS, track.compValues, (key, v) => {
        if (track.compNode) track.compNode[key].value = v;
      });
    }

    function buildGateGrid(track) {
      buildSliderGrid(track.gateControlsEl, GATE_SPECS, track, (key, v) => {
        if (!track.gateNode) return;
        if (key === 'gateThresholdDb') track.gateNode._gateState.thresholdLin = gainFromDb(v);
        else track.gateNode._gateState.reductionLin = gainFromDb(v);
      });
    }

    function buildDeEssGrid(track) {
      buildSliderGrid(track.deEssControlsEl, DEESS_SPECS, track, (key, v) => {
        if (key === 'deEssFreq') {
          if (track.deEssBandpass) track.deEssBandpass.frequency.value = v;
          if (track.deEssNotch) track.deEssNotch.frequency.value = v;
        } else if (track.deEssComp) {
          track.deEssComp.threshold.value = -track.deEssAmount * 0.4;
          track.deEssComp.ratio.value = 1 + track.deEssAmount * 0.11;
        }
      });
    }

    function addSection(parentEl, labelText, descText, gridClass) {
      const label = document.createElement('div');
      label.className = 'ac-section-label';
      label.textContent = labelText;
      const desc = document.createElement('p');
      desc.className = 'ac-section-desc';
      desc.textContent = descText;
      const grid = document.createElement('div');
      grid.className = gridClass;
      parentEl.appendChild(label);
      parentEl.appendChild(desc);
      parentEl.appendChild(grid);
      return grid;
    }

    function buildTrackPanel(def) {
      const el = document.createElement('div');
      el.className = 'ac-track';
      el.id = `acTrack-${def.key}`;

      const header = document.createElement('div');
      header.className = 'ac-track-header';

      const title = document.createElement('span');
      title.className = 'ac-track-title';
      title.textContent = def.label;

      const filename = document.createElement('span');
      filename.className = 'ac-track-filename';

      const muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.className = 'ac-ms-btn mute';
      muteBtn.textContent = 'M';
      muteBtn.title = '이 트랙 음소거';

      const soloBtn = document.createElement('button');
      soloBtn.type = 'button';
      soloBtn.className = 'ac-ms-btn solo';
      soloBtn.textContent = 'S';
      soloBtn.title = '이 트랙만 듣기 (다른 트랙은 자동 음소거)';

      const volWrap = document.createElement('div');
      volWrap.className = 'ac-track-volume-wrap';
      volWrap.title = '이 트랙만의 볼륨입니다. 보컬/반주 사이의 밸런스를 맞출 때 씁니다.';
      const { range: volInput, number: volNumInput } = createPairedInputs({
        min: -24,
        max: 12,
        step: 0.5,
        value: 0,
        decimals: 1,
        onChange: (db) => {
          track.volumeDb = db;
          if (track.trackGain) track.trackGain.gain.value = gainFromDb(db);
        },
      });
      volWrap.appendChild(document.createTextNode('볼륨'));
      volWrap.appendChild(volInput);
      volWrap.appendChild(volNumInput);
      const volUnit = document.createElement('span');
      volUnit.textContent = 'dB';
      volWrap.appendChild(volUnit);

      header.appendChild(title);
      header.appendChild(filename);
      header.appendChild(muteBtn);
      header.appendChild(soloBtn);
      header.appendChild(volWrap);
      el.appendChild(header);

      const eqGrid = addSection(
        el,
        'EQ (그래픽 이퀄라이저)',
        '낮은 대역을 올리면 소리가 두꺼워지고, 높은 대역을 올리면 선명해져요. 슬라이더에 마우스를 올리면 각 대역 설명이 보여요.',
        'ac-eq-grid',
      );
      const deEssGrid = addSection(
        el,
        '치찰음 억제 (De-esser)',
        '"스", "츠" 같은 날카로운 발음만 골라서 눌러줍니다. 기본값(0%)은 꺼진 상태예요.',
        'ac-comp-grid',
      );
      const gateGrid = addSection(
        el,
        '노이즈 게이트 (조용한 구간 잡음 줄이기)',
        'AI 노이즈 제거가 아니라, 일정 음량보다 작은 소리(숨소리·배경 잡음)를 낮추는 전통적인 방식이에요. 기본값(0dB)은 꺼진 상태예요.',
        'ac-comp-grid',
      );
      const compGrid = addSection(
        el,
        '컴프레서 (음량 편차 줄이기)',
        '작은 소리와 큰 소리의 차이를 줄여서 더 안정적으로 들리게 해요. 슬라이더에 마우스를 올리면 각 항목 설명이 보여요.',
        'ac-comp-grid',
      );

      tracksContainer.appendChild(el);

      const track = {
        key: def.key,
        el,
        filenameEl: filename,
        muteBtn,
        soloBtn,
        volInput,
        eqSlidersEl: eqGrid,
        compControlsEl: compGrid,
        gateControlsEl: gateGrid,
        deEssControlsEl: deEssGrid,
        buffer: null,
        fileName: 'audio',
        eqValues: [0, 0, 0, 0, 0, 0],
        compValues: { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 },
        gateThresholdDb: -50,
        gateReductionDb: 0,
        deEssFreq: 6500,
        deEssAmount: 0,
        volumeDb: 0,
        muted: false,
        solo: false,
        // 라이브 그래프 노드 (버퍼가 로드된 뒤 생성)
        eqNodes: [],
        compNode: null,
        gateNode: null,
        deEssBandpass: null,
        deEssNotch: null,
        deEssComp: null,
        trackGain: null,
        muteGain: null,
        sourceNode: null,
      };

      buildEqGrid(track);
      buildDeEssGrid(track);
      buildGateGrid(track);
      buildCompGrid(track);

      muteBtn.addEventListener('click', () => {
        track.muted = !track.muted;
        muteBtn.classList.toggle('active', track.muted);
        updateMuteSoloGains();
      });
      soloBtn.addEventListener('click', () => {
        track.solo = !track.solo;
        soloBtn.classList.toggle('active', track.solo);
        updateMuteSoloGains();
      });

      tracks[def.key] = track;
      return track;
    }

    TRACK_DEFS.forEach(buildTrackPanel);

    // ─────────────────────────── 뮤트/솔로 계산 ───────────────────────────
    function updateMuteSoloGains() {
      const anySolo = Object.values(tracks).some((t) => t.solo);
      Object.values(tracks).forEach((t) => {
        const audible = anySolo ? t.solo : !t.muted;
        if (t.muteGain) t.muteGain.gain.value = audible ? 1 : 0;
      });
    }

    // ─────────────────────────── 라이브 그래프 ───────────────────────────
    function buildLiveNodes(track) {
      const ctx = ensureAudioCtx();
      const chain = buildProcessingChain(ctx, track, { bypass: false });
      track.eqNodes = chain.eqNodes;
      track.gateNode = chain.gateNode;
      track.deEssBandpass = chain.deEssBandpass;
      track.deEssNotch = chain.deEssNotch;
      track.deEssComp = chain.deEssComp;
      track.compNode = chain.compNode;

      track.trackGain = ctx.createGain();
      track.trackGain.gain.value = gainFromDb(track.volumeDb);
      track.muteGain = ctx.createGain();

      chain.output.connect(track.trackGain);
      track.trackGain.connect(track.muteGain);
      track.muteGain.connect(masterGain);
      updateMuteSoloGains();
    }

    function entryNodeFor(track) {
      return bypassToggle.checked ? track.trackGain : track.gateNode;
    }

    function reconnectSourceRouting() {
      Object.values(tracks).forEach((t) => {
        if (!t.sourceNode) return;
        t.sourceNode.disconnect();
        t.sourceNode.connect(entryNodeFor(t));
      });
    }
    bypassToggle.addEventListener('change', reconnectSourceRouting);

    function applyOutputGain(raw, source) {
      const db = Math.min(12, Math.max(-12, raw));
      outputGainInput.value = String(db);
      if (source !== 'number' || db !== raw) outputGainVal.value = formatNumberValue(db, 1);
      if (masterGain) masterGain.gain.value = gainFromDb(db);
    }
    outputGainInput.addEventListener('input', () => applyOutputGain(Number(outputGainInput.value), 'range'));
    outputGainVal.addEventListener('input', () => {
      const v = Number(outputGainVal.value);
      if (Number.isNaN(v)) return;
      applyOutputGain(v, 'number');
    });
    outputGainVal.addEventListener('blur', () => applyOutputGain(Number(outputGainInput.value), 'number'));

    // ─────────────────────────── 트랜스포트 ───────────────────────────
    function totalDuration() {
      return Math.max(...Object.values(tracks).map((t) => (t.buffer ? t.buffer.duration : 0)), 0);
    }

    function tick() {
      if (!playState.playing) return;
      const elapsed = playState.offset + (audioCtx.currentTime - playState.startCtxTime);
      const total = totalDuration();
      if (elapsed >= total) {
        stopAll();
        return;
      }
      timeDisplay.textContent = `${formatTime(elapsed)} / ${formatTime(total)}`;
      playState.rafId = requestAnimationFrame(tick);
    }

    function playAll() {
      const ctx = ensureAudioCtx();
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      playState.startCtxTime = now;
      playState.playing = true;
      Object.values(tracks).forEach((t) => {
        if (!t.buffer) return;
        const source = ctx.createBufferSource();
        source.buffer = t.buffer;
        source.connect(entryNodeFor(t));
        source.start(now, playState.offset);
        t.sourceNode = source;
      });
      playPauseBtn.textContent = '⏸ 일시정지';
      tick();
    }

    function pauseAll() {
      if (!playState.playing) return;
      playState.offset += audioCtx.currentTime - playState.startCtxTime;
      Object.values(tracks).forEach((t) => {
        if (t.sourceNode) {
          try {
            t.sourceNode.stop();
          } catch {
            /* 이미 멈춘 경우 무시 */
          }
          t.sourceNode = null;
        }
      });
      playState.playing = false;
      playPauseBtn.textContent = '▶ 재생';
      if (playState.rafId) cancelAnimationFrame(playState.rafId);
    }

    function stopAll() {
      Object.values(tracks).forEach((t) => {
        if (t.sourceNode) {
          try {
            t.sourceNode.stop();
          } catch {
            /* 이미 멈춘 경우 무시 */
          }
          t.sourceNode = null;
        }
      });
      playState.playing = false;
      playState.offset = 0;
      playPauseBtn.textContent = '▶ 재생';
      if (playState.rafId) cancelAnimationFrame(playState.rafId);
      timeDisplay.textContent = `00:00 / ${formatTime(totalDuration())}`;
    }

    playPauseBtn.addEventListener('click', () => {
      if (playState.playing) pauseAll();
      else playAll();
    });
    stopBtn.addEventListener('click', stopAll);

    // ─────────────────────────── 프리셋 ───────────────────────────
    function applyPresetToTrack(track, spec) {
      spec.eq.forEach((db, i) => {
        const input = track.eqSlidersEl.querySelector(`input[data-band-index="${i}"]`);
        if (!input) return;
        input.value = String(db);
        input.dispatchEvent(new Event('input'));
      });
      Object.entries(spec.comp).forEach(([key, v]) => {
        const input = track.compControlsEl.querySelector(`input[data-key="${key}"]`);
        if (!input) return;
        input.value = String(v);
        input.dispatchEvent(new Event('input'));
      });
      const deEssInput = track.deEssControlsEl.querySelector('input[data-key="deEssAmount"]');
      if (deEssInput) {
        deEssInput.value = String(spec.deEssAmount);
        deEssInput.dispatchEvent(new Event('input'));
      }
      const gateInput = track.gateControlsEl.querySelector('input[data-key="gateReductionDb"]');
      if (gateInput) {
        gateInput.value = String(spec.gateReductionDb);
        gateInput.dispatchEvent(new Event('input'));
      }
      track.volInput.value = String(spec.gain);
      track.volInput.dispatchEvent(new Event('input'));
    }

    presetsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.ac-preset-btn');
      if (!btn) return;
      const preset = PRESETS[btn.dataset.preset];
      if (!preset) return;
      Object.values(tracks).forEach((t) => applyPresetToTrack(t, preset[t.key]));
    });

    // ─────────────────────────── 파일 업로드 ───────────────────────────
    function updateExportEnabled() {
      exportBtn.disabled = !Object.values(tracks).some((t) => t.buffer);
    }

    TRACK_DEFS.forEach((def) => {
      const input = document.getElementById(def.inputId);
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;
        const track = tracks[def.key];
        track.fileName = file.name.replace(/\.[^.]+$/, '') || def.key;
        track.filenameEl.textContent = file.name;

        const arrayBuffer = await file.arrayBuffer();
        const ctx = ensureAudioCtx();
        try {
          track.buffer = await ctx.decodeAudioData(arrayBuffer);
        } catch (err) {
          alert(`${def.label} 파일을 디코딩하지 못했습니다: ${err.message || err}`);
          return;
        }

        track.el.style.display = 'flex';
        transportEl.style.display = 'flex';
        exportStatus.textContent = '';
        buildLiveNodes(track);
        stopAll();
        updateExportEnabled();
      });
    });

    // ─────────────────────────── 믹스 내보내기 ───────────────────────────
    function normalizePeakIfNeeded(buffer) {
      let peak = 0;
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          const abs = Math.abs(data[i]);
          if (abs > peak) peak = abs;
        }
      }
      if (peak > 0.999) {
        const scale = 0.999 / peak;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
          const data = buffer.getChannelData(ch);
          for (let i = 0; i < data.length; i++) data[i] *= scale;
        }
      }
    }

    exportBtn.addEventListener('click', async () => {
      const loadedTracks = Object.values(tracks).filter((t) => t.buffer);
      if (loadedTracks.length === 0) return;

      exportBtn.disabled = true;
      exportStatus.textContent = '전체 오디오를 렌더링하는 중입니다...';

      try {
        const sampleRate = loadedTracks[0].buffer.sampleRate;
        const maxLength = Math.max(...loadedTracks.map((t) => t.buffer.length));
        const offlineCtx = new OfflineAudioContext(2, maxLength, sampleRate);

        const anySolo = loadedTracks.some((t) => t.solo);
        const offlineMaster = offlineCtx.createGain();
        offlineMaster.gain.value = gainFromDb(Number(outputGainInput.value));
        offlineMaster.connect(offlineCtx.destination);

        loadedTracks.forEach((t) => {
          const audible = anySolo ? t.solo : !t.muted;
          if (!audible) return;

          const source = offlineCtx.createBufferSource();
          source.buffer = t.buffer;

          const chain = buildProcessingChain(offlineCtx, t, { bypass: bypassToggle.checked });
          const volGain = offlineCtx.createGain();
          volGain.gain.value = gainFromDb(t.volumeDb);

          source.connect(chain.entry);
          chain.output.connect(volGain);
          volGain.connect(offlineMaster);
          source.start(0);
        });

        const rendered = await offlineCtx.startRendering();
        normalizePeakIfNeeded(rendered);
        const blob = audioBufferToWavBlob(rendered);

        const fileNameBase = loadedTracks.map((t) => t.fileName).join('_+_');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileNameBase}_mix.wav`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        exportStatus.textContent = '다운로드가 시작되었습니다.';
      } catch (err) {
        exportStatus.textContent = `내보내기에 실패했습니다: ${err.message || err}`;
      } finally {
        exportBtn.disabled = false;
      }
    });
  }

  function audioBufferToWavBlob(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2;
    const dataLength = buffer.length * numChannels * bytesPerSample;
    const arrayBuffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(arrayBuffer);

    function writeString(offset, str) {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    const channelData = [];
    for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));

    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        let sample = Math.max(-1, Math.min(1, channelData[ch][i]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, sample, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initManualMode();
  });
})();
