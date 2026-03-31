(function() {
  'use strict';

  // --- HÀM TIỆN ÍCH CHUNG ---
  const formatMoney = (val) => new Intl.NumberFormat('vi-VN').format(Math.round(val || 0));
  const formatNumber = (val) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(val || 0);
  const formatDate = (dateString) => {
    if (!dateString) return '--/--/----';
    const parts = dateString.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateString;
  };

  const hexToRgba = (hex, opacity) => {
    let c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
      c= hex.substring(1).split('');
      if(c.length === 3) c= [c[0], c[0], c[1], c[1], c[2], c[2]];
      c= '0x'+c.join('');
      return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+(opacity/100)+')';
    }
    return hex; 
  };

  // ==========================================
  // 1. LỚP CHỈNH SỬA GIAO DIỆN UI (EDITOR)
  // ==========================================
  class ShoppingHistoryEditor extends HTMLElement {
    
    constructor() {
      super();
      this._config = {}; 
    }

    setConfig(config) {
      this._config = config || {};
      if (this._rendered) this.updateUI();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._rendered) {
        this.render();
        this._rendered = true;
      }
    }

    render() {
      if (!this._hass) return;
      
      const conf = this._config || {};
      const currentTitle = conf.title || "Shopping Khải";
      const currentIcon = conf.icon || "mdi:cart-outline";

      this.innerHTML = `
        <style>
          .editor-container { padding: 12px 0; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
          .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; width: 100%;}
          .row-col { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; width: 100%;}
          .row:last-child, .row-col:last-child { margin-bottom: 0; }
          .label { font-weight: 500; color: var(--primary-text-color); font-size: 14px; }
          .input-group { display: flex; align-items: center; gap: 12px; }
          input[type=color] { cursor: pointer; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 6px; padding: 2px; width: 40px; height: 32px; background: transparent; }
          input[type=range] { flex-grow: 1; cursor: pointer; }
          input[type=text], select.custom-input { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid var(--divider-color, #ccc); background: var(--card-background-color, transparent); color: var(--primary-text-color); box-sizing: border-box; font-size: 14px;}
          .val-badge { background: var(--primary-color); color: var(--text-primary-color, white); padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; min-width: 48px; text-align: center; }
          select.ha-select { background: var(--card-background-color, transparent); color: var(--primary-text-color); border: 1px solid var(--divider-color, #e0e0e0); padding: 6px 8px; border-radius: 6px; font-family: inherit; font-size: 14px; flex-grow: 1; max-width: 250px; cursor: pointer; }
          
          .section { border: 1px solid var(--divider-color, #e0e0e0); border-radius: 12px; padding: 16px; margin-bottom: 16px; background: var(--card-background-color, transparent); box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: padding 0.3s ease; }
          .section.collapsed { padding-bottom: 16px; }
          .section-title { font-weight: 600; display: flex; align-items: center; justify-content: space-between; font-size: 16px; color: var(--primary-text-color); border-bottom: 1px solid var(--divider-color, #e0e0e0); padding-bottom: 8px; margin-bottom: 16px; cursor: pointer; user-select: none; }
          .section-title.no-collapse { cursor: default; }
          .section-title.no-collapse:hover { opacity: 1; }
          .section-title:hover { opacity: 0.8; }
          .section.collapsed .section-title { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
          .section-content { display: block; overflow: hidden; animation: slideDown 0.3s ease-out forwards; }
          .section.collapsed .section-content { display: none; }
          .section-icon { font-size: 12px; opacity: 0.6; transition: transform 0.3s ease; }
          .section.collapsed .section-icon { transform: rotate(-90deg); }
          .title-left { display: flex; align-items: center; gap: 8px; pointer-events: none; }
          .title-right { display: flex; align-items: center; gap: 12px; }
          
          @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        </style>

        <div class="editor-container">
          
          <div class="section">
            <div class="section-title no-collapse">
              <div class="title-left">⚙️ Cài đặt chung</div>
            </div>
            <div class="section-content">
              <div class="row-col">
                <span class="label">Tiêu đề thẻ (Tuỳ chọn)</span>
                <input type="text" id="title-input" class="custom-input config-trigger" placeholder="VD: Shopping Khải" value="${currentTitle}">
              </div>
              <div class="row-col">
                <span class="label">Icon hoặc Emoji (Tuỳ chọn)</span>
                <input type="text" id="icon-input" class="custom-input config-trigger" placeholder="VD: mdi:cart-outline hoặc 🛒" value="${currentIcon}">
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title no-collapse">
              <div class="title-left">🎨 Nền (Background)</div>
            </div>
            <div class="section-content">
              <div class="row">
                <span class="label" style="min-width: 120px;">Loại nền</span>
                <select id="bg_type" class="ha-select config-trigger">
                  <option value="solid">Màu đơn sắc (Solid)</option>
                  <option value="gradient">Màu dải (Gradient)</option>
                </select>
              </div>
              <div class="row">
                <span class="label" style="min-width: 120px;">Độ trong suốt (%)</span>
                <input type="range" id="bg_opacity" class="config-trigger" min="0" max="100">
                <span class="val-badge" id="bg_opacity_val"></span>
              </div>

              <div id="solid_settings">
                <div class="row" style="margin-top: 16px; border-top: 1px dashed var(--divider-color, #e0e0e0); padding-top: 16px;">
                  <span class="label">Màu nền</span>
                  <div class="input-group"><input type="color" id="bg_color" class="config-trigger"><span class="val-badge" id="bg_color_val"></span></div>
                </div>
              </div>

              <div id="gradient_settings" style="display:none;">
                <div class="row" style="margin-top: 16px; border-top: 1px dashed var(--divider-color, #e0e0e0); padding-top: 16px;">
                  <span class="label" style="min-width: 120px;">Mẫu Gradient</span>
                  <select id="bg_gradient_preset" class="ha-select config-trigger">
                    <option value="linear-gradient(135deg, rgba(15,23,42,1), rgba(30,41,59,1))">🌙 Kính mờ Tối (Mặc định)</option>
                    <option value="linear-gradient(135deg, #f0f4f8, #d9e2ec)">☀️ Kính mờ Sáng</option>
                    <option value="linear-gradient(135deg, #141e30, #243b55)">🌌 Royal Night</option>
                    <option value="linear-gradient(135deg, #0f2027, #203a43, #2c5364)">🌊 Deep Ocean</option>
                    <option value="linear-gradient(135deg, #232526, #414345)">🏙️ Midnight City</option>
                    <option value="linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))">🪟 Glassmorphism Thuần</option>
                    <option value="linear-gradient(135deg, #667eea, #764ba2)">💜 Plum Plate</option>
                    <option value="linear-gradient(135deg, #11998e, #38ef7d)">🌿 Neon Life</option>
                    <option value="linear-gradient(135deg, #2b5876, #4e4376)">🌠 Starry Night</option>
                    <option value="custom">✍️ Tùy chỉnh (Custom)</option>
                  </select>
                </div>

                <div id="custom_gradient_row" style="display:none; flex-direction: column; gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--divider-color, #e0e0e0);">
                  <div class="row" style="width: 100%;">
                    <span class="label">Màu 1</span>
                    <div class="input-group"><input type="color" id="bg_gradient_color1" class="config-trigger"><span class="val-badge" id="bg_gradient_color1_val"></span></div>
                  </div>
                  <div class="row" style="width: 100%;">
                    <span class="label">Màu 2</span>
                    <div class="input-group"><input type="color" id="bg_gradient_color2" class="config-trigger"><span class="val-badge" id="bg_gradient_color2_val"></span></div>
                  </div>
                  <div class="row" style="width: 100%;">
                    <span class="label" style="min-width: 120px;">Góc độ (°)</span>
                    <input type="range" id="bg_gradient_angle" class="config-trigger" min="0" max="360" step="1">
                    <span class="val-badge" id="bg_gradient_angle_val"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="section collapsed">
            <div class="section-title">
              <div class="title-left">🖋️ Nội dung & Màu sắc</div>
              <div class="title-right">
                <input type="checkbox" id="auto_contrast" class="config-trigger" style="transform: scale(1.2); cursor: pointer;" title="Tự động tương phản màu theo Nền">
                <span class="section-icon">▼</span>
              </div>
            </div>
            <div class="section-content">
              <div id="custom_colors_settings">
                <div class="row"><span class="label">Màu chữ chính</span><div class="input-group"><input type="color" id="textColor" class="config-trigger"></div></div>
                <div class="row"><span class="label">Màu Nhấn (Accent)</span><div class="input-group"><input type="color" id="accentColor" class="config-trigger"></div></div>
                <div class="row"><span class="label">Màu Tiền / Nổi bật</span><div class="input-group"><input type="color" id="moneyColor" class="config-trigger"></div></div>
                <div class="row"><span class="label">Màu Nền các khối nhỏ</span><div class="input-group"><input type="color" id="blockBg" class="config-trigger"></div></div>
              </div>
            </div>
          </div>

          <div class="section collapsed">
            <div class="section-title">
              <div class="title-left">🔲 Viền (Border)</div>
              <div class="title-right">
                <input type="checkbox" id="border_enable" class="config-trigger" style="transform: scale(1.2); cursor: pointer;" title="Bật/Tắt viền">
                <span class="section-icon">▼</span>
              </div>
            </div>
            <div class="section-content">
              <div id="border_settings">
                <div class="row"><span class="label">Màu viền</span><div class="input-group"><input type="color" id="border_color" class="config-trigger"><span class="val-badge" id="border_color_val"></span></div></div>
                <div class="row"><span class="label" style="min-width: 120px;">Độ dày viền (px)</span><input type="range" id="border_width" class="config-trigger" min="0" max="10" step="1"><span class="val-badge" id="border_width_val"></span></div>
                <div class="row"><span class="label" style="min-width: 120px;">Độ trong suốt (%)</span><input type="range" id="border_opacity" class="config-trigger" min="0" max="100"><span class="val-badge" id="border_opacity_val"></span></div>
              </div>
            </div>
          </div>

          <div class="section collapsed">
            <div class="section-title">
              <div class="title-left">☁️ Đổ bóng (Shadow)</div>
              <div class="title-right">
                <input type="checkbox" id="shadow_enable" class="config-trigger" style="transform: scale(1.2); cursor: pointer;" title="Bật/Tắt hiệu ứng đổ bóng">
                <span class="section-icon">▼</span>
              </div>
            </div>
            <div class="section-content">
              <div id="shadow_settings">
                <div class="row"><span class="label">Màu đổ bóng</span><div class="input-group"><input type="color" id="shadow_color" class="config-trigger"><span class="val-badge" id="shadow_color_val"></span></div></div>
                <div class="row"><span class="label" style="min-width: 120px;">Độ trong suốt (%)</span><input type="range" id="shadow_opacity" class="config-trigger" min="0" max="100"><span class="val-badge" id="shadow_opacity_val"></span></div>
                <div class="row"><span class="label" style="min-width: 120px;">Độ nhòe (Blur)</span><input type="range" id="shadow_blur" class="config-trigger" min="0" max="100"><span class="val-badge" id="shadow_blur_val"></span></div>
                <div class="row"><span class="label" style="min-width: 120px;">Khoảng cách (X)</span><input type="range" id="shadow_offset_x" class="config-trigger" min="-50" max="50"><span class="val-badge" id="shadow_offset_x_val"></span></div>
                <div class="row"><span class="label" style="min-width: 120px;">Khoảng cách (Y)</span><input type="range" id="shadow_offset_y" class="config-trigger" min="-50" max="50"><span class="val-badge" id="shadow_offset_y_val"></span></div>
              </div>
            </div>
          </div>

        </div>
      `;

      this.updateUI();
      this.addListeners();
    }

    get _bg_type() { return this._config?.bg_type || 'gradient'; }
    get _bg_color() { return this._config?.bg_color || '#0f172a'; }
    get _bg_opacity() { return this._config?.bg_opacity !== undefined ? this._config.bg_opacity : 60; }
    get _bg_gradient_preset() { return this._config?.bg_gradient_preset || 'linear-gradient(135deg, rgba(15,23,42,1), rgba(30,41,59,1))'; }
    get _bg_gradient_color1() { return this._config?.bg_gradient_color1 || '#0f172a'; }
    get _bg_gradient_color2() { return this._config?.bg_gradient_color2 || '#1e293b'; }
    get _bg_gradient_angle() { return this._config?.bg_gradient_angle !== undefined ? this._config.bg_gradient_angle : 135; }

    get _border_enable() { return this._config?.border_enable !== undefined ? this._config.border_enable : true; }
    get _border_color() { return this._config?.border_color || '#ffffff'; }
    get _border_width() { return this._config?.border_width !== undefined ? this._config.border_width : 1; }
    get _border_opacity() { return this._config?.border_opacity !== undefined ? this._config.border_opacity : 10; }
    
    get _shadow_enable() { return this._config?.shadow_enable !== undefined ? this._config.shadow_enable : true; }
    get _shadow_color() { return this._config?.shadow_color || '#000000'; }
    get _shadow_opacity() { return this._config?.shadow_opacity !== undefined ? this._config.shadow_opacity : 20; }
    get _shadow_blur() { return this._config?.shadow_blur !== undefined ? this._config.shadow_blur : 32; }
    get _shadow_offset_x() { return this._config?.shadow_offset_x !== undefined ? this._config.shadow_offset_x : 0; }
    get _shadow_offset_y() { return this._config?.shadow_offset_y !== undefined ? this._config.shadow_offset_y : 8; }

    get _auto_contrast() { return this._config?.auto_contrast !== undefined ? this._config.auto_contrast : true; }
    get _textColor() { return this._config?.textColor || '#f8fafc'; }
    get _accentColor() { return this._config?.accentColor || '#0ea5e9'; }
    get _moneyColor() { return this._config?.moneyColor || '#38bdf8'; }
    get _blockBg() { return this._config?.blockBg || '#1e293b'; }

    updateUI() {
      if (!this.querySelector('#bg_type')) return;
      
      this.querySelector('#bg_type').value = this._bg_type;
      this.querySelector('#bg_opacity').value = this._bg_opacity;
      this.querySelector('#bg_opacity_val').textContent = this._bg_opacity + '%';

      if (this._bg_type === 'gradient') {
        this.querySelector('#solid_settings').style.display = 'none';
        this.querySelector('#gradient_settings').style.display = 'block';
      } else {
        this.querySelector('#solid_settings').style.display = 'block';
        this.querySelector('#gradient_settings').style.display = 'none';
      }

      this.querySelector('#bg_color').value = this._bg_color;
      this.querySelector('#bg_color_val').textContent = this._bg_color.toUpperCase();
      this.querySelector('#bg_gradient_preset').value = this._bg_gradient_preset;
      
      if (this._bg_gradient_preset === 'custom') {
        this.querySelector('#custom_gradient_row').style.display = 'flex';
      } else {
        this.querySelector('#custom_gradient_row').style.display = 'none';
      }
      
      this.querySelector('#bg_gradient_color1').value = this._bg_gradient_color1;
      this.querySelector('#bg_gradient_color1_val').textContent = this._bg_gradient_color1.toUpperCase();
      this.querySelector('#bg_gradient_color2').value = this._bg_gradient_color2;
      this.querySelector('#bg_gradient_color2_val').textContent = this._bg_gradient_color2.toUpperCase();
      this.querySelector('#bg_gradient_angle').value = this._bg_gradient_angle;
      this.querySelector('#bg_gradient_angle_val').textContent = this._bg_gradient_angle + '°';

      const borderCheckbox = this.querySelector('#border_enable');
      if (borderCheckbox) borderCheckbox.checked = this._border_enable;
      this.querySelector('#border_settings').style.display = this._border_enable ? 'block' : 'none';
      this.querySelector('#border_color').value = this._border_color;
      this.querySelector('#border_color_val').textContent = this._border_color.toUpperCase();
      this.querySelector('#border_width').value = this._border_width;
      this.querySelector('#border_width_val').textContent = this._border_width + 'px';
      this.querySelector('#border_opacity').value = this._border_opacity;
      this.querySelector('#border_opacity_val').textContent = this._border_opacity + '%';

      this.querySelector('#shadow_enable').checked = this._shadow_enable;
      this.querySelector('#shadow_settings').style.display = this._shadow_enable ? 'block' : 'none';
      this.querySelector('#shadow_color').value = this._shadow_color;
      this.querySelector('#shadow_color_val').textContent = this._shadow_color.toUpperCase();
      this.querySelector('#shadow_opacity').value = this._shadow_opacity;
      this.querySelector('#shadow_opacity_val').textContent = this._shadow_opacity + '%';
      this.querySelector('#shadow_blur').value = this._shadow_blur;
      this.querySelector('#shadow_blur_val').textContent = this._shadow_blur + 'px';
      this.querySelector('#shadow_offset_x').value = this._shadow_offset_x;
      this.querySelector('#shadow_offset_x_val').textContent = this._shadow_offset_x + 'px';
      this.querySelector('#shadow_offset_y').value = this._shadow_offset_y;
      this.querySelector('#shadow_offset_y_val').textContent = this._shadow_offset_y + 'px';

      this.querySelector('#auto_contrast').checked = this._auto_contrast;
      if (this._auto_contrast) {
          this.querySelector('#custom_colors_settings').style.opacity = '0.4';
          this.querySelector('#custom_colors_settings').style.pointerEvents = 'none';
      } else {
          this.querySelector('#custom_colors_settings').style.opacity = '1';
          this.querySelector('#custom_colors_settings').style.pointerEvents = 'auto';
      }

      this.querySelector('#textColor').value = this._textColor;
      this.querySelector('#accentColor').value = this._accentColor;
      this.querySelector('#moneyColor').value = this._moneyColor;
      this.querySelector('#blockBg').value = this._blockBg;
    }

    addListeners() {
      const dispatchUpdate = () => {
        let newConfig = { 
            ...this._config,
            title: this.querySelector('#title-input').value,
            icon: this.querySelector('#icon-input').value,

            bg_type: this.querySelector('#bg_type').value,
            bg_color: this.querySelector('#bg_color').value,
            bg_opacity: parseInt(this.querySelector('#bg_opacity').value, 10),
            bg_gradient_preset: this.querySelector('#bg_gradient_preset').value,
            bg_gradient_color1: this.querySelector('#bg_gradient_color1').value,
            bg_gradient_color2: this.querySelector('#bg_gradient_color2').value,
            bg_gradient_angle: parseInt(this.querySelector('#bg_gradient_angle').value, 10),

            border_enable: this.querySelector('#border_enable').checked,
            border_color: this.querySelector('#border_color').value,
            border_width: parseInt(this.querySelector('#border_width').value, 10),
            border_opacity: parseInt(this.querySelector('#border_opacity').value, 10),
            
            shadow_enable: this.querySelector('#shadow_enable').checked,
            shadow_color: this.querySelector('#shadow_color').value,
            shadow_opacity: parseInt(this.querySelector('#shadow_opacity').value, 10),
            shadow_blur: parseInt(this.querySelector('#shadow_blur').value, 10),
            shadow_offset_x: parseInt(this.querySelector('#shadow_offset_x').value, 10),
            shadow_offset_y: parseInt(this.querySelector('#shadow_offset_y').value, 10),

            auto_contrast: this.querySelector('#auto_contrast').checked,
            textColor: this.querySelector('#textColor').value,
            accentColor: this.querySelector('#accentColor').value,
            moneyColor: this.querySelector('#moneyColor').value,
            blockBg: this.querySelector('#blockBg').value
        };
        
        const event = new CustomEvent("config-changed", { detail: { config: newConfig }, bubbles: true, composed: true });
        this.dispatchEvent(event);
      };

      this.querySelectorAll('.config-trigger').forEach(el => {
        if (el.tagName === 'SELECT') {
            el.addEventListener('change', dispatchUpdate);
        } else {
            el.addEventListener('input', dispatchUpdate);
            el.addEventListener('change', dispatchUpdate); 
        }
      });

      this.querySelectorAll('.section-title:not(.no-collapse)').forEach(titleEl => {
        const inputs = titleEl.querySelectorAll('input, select, button');
        inputs.forEach(input => {
          input.addEventListener('click', (e) => e.stopPropagation());
        });

        titleEl.addEventListener('click', () => {
          const section = titleEl.closest('.section');
          section.classList.toggle('collapsed');
        });
      });
    }
  }

  // ==========================================
  // 2. LỚP HIỂN THỊ GIAO DIỆN THẺ (CARD)
  // ==========================================
  class ShoppingHistoryCard extends HTMLElement {
    static getConfigElement() { return document.createElement('shopping-history-editor'); }
    static getStubConfig() { return { title: "Shopping Khải", icon: "mdi:cart-outline", bg_opacity: 60 }; }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
      
      const now = new Date();
      this._selectedYear = now.getFullYear();
      this._selectedMonth = now.getMonth() + 1;
      
      this._baseSlugs = [];
      this._currentBaseSlug = null;
      this._availableYears = [];
      this._items = [];
      this._stats = { orders: 0, items: 0, total: 0 };
    }

    setConfig(config) {
      if (!config) throw new Error("Invalid configuration");
      this._config = config;
      this.renderInit();
      if (this._hass) this.updateView();
    }

    set hass(hass) {
      const oldHass = this._hass;
      this._hass = hass;
      
      if (!oldHass) {
        this.scanSensors();
        this.updateData();
      } else {
        let shouldUpdate = false;
        // Chỉ quét các sensor có chứa '_year_' theo cấu trúc backend mới
        const relevantSensors = Object.keys(hass.states).filter(k => k.startsWith('sensor.') && k.includes('_year_'));
        for (let eid of relevantSensors) {
            if (oldHass.states[eid] !== hass.states[eid]) {
                shouldUpdate = true;
                break;
            }
        }
        if (shouldUpdate) {
            this.scanSensors();
            this.updateData();
        }
      }
    }

    scanSensors() {
      if (!this._hass) return;
      
      const yearSensors = Object.keys(this._hass.states).filter(eid => 
        eid.startsWith('sensor.') && eid.includes('_year_') && this._hass.states[eid].attributes.danh_sach_chi_tiet
      );

      const bases = new Set();
      const years = new Set();

      yearSensors.forEach(eid => {
        // Tìm các sensor theo chuẩn mới: sensor.[base_slug]_year_[year]
        const match = eid.match(/^sensor\.(.+)_year_(\d{4})$/);
        if (match) {
            bases.add(match[1]);
            years.add(parseInt(match[2]));
        }
      });

      this._baseSlugs = Array.from(bases);
      if (!this._currentBaseSlug && this._baseSlugs.length > 0) {
          this._currentBaseSlug = this._baseSlugs[0];
      }

      this._availableYears = Array.from(years).sort((a, b) => b - a);
      if (!this._availableYears.includes(this._selectedYear) && this._availableYears.length > 0) {
          this._selectedYear = this._availableYears[0];
      }
    }

    updateData() {
      if (!this._hass || !this._currentBaseSlug) return;

      this._items = [];
      this._stats = { orders: 0, items: 0, total: 0 };

      // Backend giờ chỉ cung cấp 1 sensor duy nhất chứa toàn bộ dữ liệu của năm
      const yearEid = `sensor.${this._currentBaseSlug}_year_${this._selectedYear}`;
      const yearState = this._hass.states[yearEid];
      
      if (yearState && yearState.attributes && yearState.attributes.danh_sach_chi_tiet) {
          const allItems = yearState.attributes.danh_sach_chi_tiet;
          
          if (this._selectedMonth === 'all') {
              this._items = [...allItems];
              this._stats.orders = yearState.attributes.tong_don_hang || allItems.length;
              this._stats.items = yearState.attributes.tong_so_luong || allItems.reduce((sum, item) => sum + (item.so_luong || 0), 0);
              this._stats.total = yearState.attributes.tong_tien || allItems.reduce((sum, item) => sum + (item.thanh_tien_sau_vat || 0), 0);
          } else {
              // Lọc thủ công dữ liệu tháng tại frontend để giao diện siêu mượt
              this._items = allItems.filter(item => parseInt(item.thang) === parseInt(this._selectedMonth));
              this._stats.orders = this._items.length;
              this._stats.items = this._items.reduce((sum, item) => sum + (item.so_luong || 0), 0);
              this._stats.total = this._items.reduce((sum, item) => sum + (item.thanh_tien_sau_vat || 0), 0);
          }
      }

      this._items.sort((a, b) => new Date(b.ngay_mua) - new Date(a.ngay_mua));
      this.updateView();
    }

    renderInit() {
      if (!this.card) {
        this.card = document.createElement('ha-card');
        this.shadowRoot.appendChild(this.card);
        
        this.card.addEventListener('change', (e) => {
            if (e.target.id === 'year-select') {
                this._selectedYear = parseInt(e.target.value);
                this.updateData();
            } else if (e.target.id === 'month-select') {
                this._selectedMonth = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
                this.updateData();
            }
        });
      }
    }

    updateView() {
      if (!this.card) return;

      const conf = this._config || {};
      const title = conf.title || "Shopping Khải";
      const configIcon = conf.icon || "mdi:cart-outline";

      // --- 1. XỬ LÝ BACKGROUND, BORDER, SHADOW ---
      const applyOpacityToGradientStr = (str, opacity) => {
          return str.replace(/#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/gi, (match) => hexToRgba(match, opacity));
      };

      const bgType = conf.bg_type || 'gradient';
      const bgOpacity = conf.bg_opacity !== undefined ? conf.bg_opacity : 60;
      let stringForContrastCalc = ""; 

      if (bgType === 'gradient') {
          const preset = conf.bg_gradient_preset || 'linear-gradient(135deg, rgba(15,23,42,1), rgba(30,41,59,1))';
          if (preset === 'custom') {
              const color1 = conf.bg_gradient_color1 || '#0f172a';
              const color2 = conf.bg_gradient_color2 || '#1e293b';
              const angle = conf.bg_gradient_angle !== undefined ? conf.bg_gradient_angle : 135;
              this.card.style.background = `linear-gradient(${angle}deg, ${hexToRgba(color1, bgOpacity)}, ${hexToRgba(color2, bgOpacity)})`;
              stringForContrastCalc = `${color1} ${color2}`;
          } else {
              this.card.style.background = applyOpacityToGradientStr(preset, bgOpacity);
              stringForContrastCalc = preset;
          }
      } else {
          const bgColor = conf.bg_color || '#0f172a';
          this.card.style.background = hexToRgba(bgColor, bgOpacity);
          stringForContrastCalc = bgColor;
      }

      // Border
      const borderEnabled = conf.border_enable !== undefined ? conf.border_enable : true;
      if (borderEnabled) {
          const borderWidth = conf.border_width !== undefined ? conf.border_width : 1;
          const borderOpacity = conf.border_opacity !== undefined ? conf.border_opacity : 10;
          const borderColor = conf.border_color || '#ffffff';
          if (borderOpacity > 0 && borderWidth > 0) {
              this.card.style.border = `${borderWidth}px solid ${hexToRgba(borderColor, borderOpacity)}`;
          } else {
              this.card.style.border = 'none';
          }
      } else {
          this.card.style.border = 'none';
      }

      // Shadow
      const shadowEnabled = conf.shadow_enable !== undefined ? conf.shadow_enable : true;
      if (shadowEnabled) {
          const shadowColor = conf.shadow_color || '#000000';
          const shadowOpacity = conf.shadow_opacity !== undefined ? conf.shadow_opacity : 20;
          const blur = conf.shadow_blur !== undefined ? conf.shadow_blur : 32;
          const offsetX = conf.shadow_offset_x !== undefined ? conf.shadow_offset_x : 0;
          const offsetY = conf.shadow_offset_y !== undefined ? conf.shadow_offset_y : 8;
          this.card.style.boxShadow = `${offsetX}px ${offsetY}px ${blur}px ${hexToRgba(shadowColor, shadowOpacity)}`;
      } else {
          this.card.style.boxShadow = 'none';
      }
      
      // Backdrop filter cho Glassmorphism
      this.card.style.backdropFilter = "blur(16px)";
      this.card.style.webkitBackdropFilter = "blur(16px)";
      this.card.style.borderRadius = "var(--ha-card-border-radius, 16px)";
      this.card.style.padding = "clamp(12px, 3vw, 16px)";
      this.card.style.overflow = "hidden";

      // --- 2. XỬ LÝ MÀU SẮC & AUTO CONTRAST ---
      let c_text = conf.textColor || '#f8fafc';
      let c_accent = conf.accentColor || '#0ea5e9';
      let c_money = conf.moneyColor || '#38bdf8';
      let c_block = conf.blockBg || 'rgba(255, 255, 255, 0.05)';
      let c_text_dim = '';
      let c_option_bg = '';

      if (conf.auto_contrast !== false) { // Default là true
          const hexRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/gi;
          let match;
          let colorsToCheck = [];
          while ((match = hexRegex.exec(stringForContrastCalc)) !== null) {
              let hex = match[1];
              if (hex.length === 3) hex = hex.split('').map(x => x+x).join('');
              colorsToCheck.push({ r: parseInt(hex.substring(0,2), 16), g: parseInt(hex.substring(2,4), 16), b: parseInt(hex.substring(4,6), 16) });
          }
          const rgbRegex = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi;
          while ((match = rgbRegex.exec(stringForContrastCalc)) !== null) {
              colorsToCheck.push({ r: parseInt(match[1], 10), g: parseInt(match[2], 10), b: parseInt(match[3], 10) });
          }

          if (colorsToCheck.length > 0) {
              let avgR = 0, avgG = 0, avgB = 0;
              colorsToCheck.forEach(c => { avgR += c.r; avgG += c.g; avgB += c.b; });
              avgR = Math.round(avgR / colorsToCheck.length);
              avgG = Math.round(avgG / colorsToCheck.length);
              avgB = Math.round(avgB / colorsToCheck.length);

              let isDarkTheme = false;
              if (this._hass && this._hass.themes && this._hass.themes.darkMode !== undefined) {
                  isDarkTheme = this._hass.themes.darkMode;
              } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                  isDarkTheme = true;
              }

              const op = bgOpacity / 100;
              const baseBg = isDarkTheme ? 30 : 245; 
              const effR = Math.round(avgR * op + baseBg * (1 - op));
              const effG = Math.round(avgG * op + baseBg * (1 - op));
              const effB = Math.round(avgB * op + baseBg * (1 - op));

              const yiq = ((effR * 299) + (effG * 587) + (effB * 114)) / 1000;
              const isLightBackground = yiq >= 135;

              if (isLightBackground) {
                  c_text = '#1a1a1a';
                  c_text_dim = 'rgba(0,0,0,0.6)';
                  c_accent = '#0284c7';
                  c_money = '#ea580c';
                  c_block = `rgba(0, 0, 0, Math.max(0.04, ${op * 0.1}))`; 
                  c_option_bg = '#ffffff';
              } else {
                  c_text = '#f8fafc';
                  c_text_dim = 'rgba(255,255,255,0.6)';
                  c_accent = '#0ea5e9';
                  c_money = '#38bdf8';
                  c_block = `rgba(255, 255, 255, Math.max(0.05, ${op * 0.1}))`;
                  c_option_bg = '#1e293b';
              }
          }
      } else {
          // Khi tắt auto_contrast, tự tính c_text_dim và c_option_bg dựa trên c_text
          c_text_dim = hexToRgba(c_text, 60);
          c_option_bg = c_block;
      }

      const iconHtml = configIcon.includes(":") 
          ? `<ha-icon icon="${configIcon}"></ha-icon>` 
          : `<span class="emoji-icon">${configIcon}</span>`;


      // --- 3. HIỂN THỊ HTML ---
      let html = `
        <style>
          :host {
            --text-main: ${c_text};
            --text-dim: ${c_text_dim};
            --accent: ${c_accent};
            --money: ${c_money};
            --block-bg: ${c_block};
            --option-bg: ${c_option_bg};
            --glass-border: ${hexToRgba(conf.border_color || '#ffffff', (conf.border_opacity || 10) / 2)};
          }

          .header {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: clamp(18px, 5vw, 22px);
            font-weight: 700;
            margin-bottom: clamp(12px, 3vw, 16px);
            color: var(--text-main);
          }
          .header ha-icon, .header .emoji-icon {
             color: var(--text-main);
             opacity: 0.9;
          }

          .controls {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: clamp(8px, 2vw, 12px);
            margin-bottom: clamp(16px, 4vw, 20px);
          }

          .control-box {
            background: var(--block-bg);
            border: 1px solid var(--glass-border);
            border-radius: 12px;
            padding: clamp(6px, 1.5vw, 8px) clamp(8px, 2vw, 12px);
            display: flex;
            align-items: center;
            gap: clamp(6px, 2vw, 12px);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
          }

          .control-box ha-icon {
            color: var(--accent);
            font-size: clamp(20px, 5vw, 24px);
          }

          .control-box select {
            background: transparent;
            border: none;
            color: var(--text-main);
            font-size: clamp(13px, 3.5vw, 16px);
            font-weight: 700;
            width: 100%;
            outline: none;
            cursor: pointer;
            appearance: none;
            -webkit-appearance: none;
            padding: 2px 0;
          }
          .control-box select option {
            background-color: var(--option-bg);
            color: var(--text-main);
          }
          
          .cb-label { font-size: clamp(9px, 2.5vw, 11px); color: var(--text-dim); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;}

          .stats-container {
            margin-top: clamp(12px, 3vw, 16px);
            padding-top: clamp(12px, 3vw, 16px);
            border-top: 1px dashed var(--glass-border);
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .stat-line {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: clamp(12px, 3.5vw, 14px);
            color: var(--text-dim);
            font-weight: 500;
          }
          .stat-line strong {
            color: var(--money);
            font-size: clamp(14px, 4vw, 16px);
            font-weight: 800;
          }
          .stat-line .val-qty { color: #fbbf24; }

          /* Bảng Chi Tiết Hiện Đại (Grid Responsive) */
          .table-wrapper {
            background: var(--block-bg);
            border-radius: 12px;
            border: 1px solid var(--glass-border);
            overflow: hidden;
            margin-top: clamp(12px, 3vw, 16px);
          }

          .t-header {
            display: grid;
            grid-template-columns: clamp(50px, 12vw, 70px) 1fr clamp(80px, 22vw, 110px);
            padding: clamp(8px, 2vw, 12px);
            background: rgba(0, 0, 0, 0.1);
            border-bottom: 1px solid var(--glass-border);
            font-size: clamp(10px, 2.5vw, 12px);
            font-weight: 800;
            color: var(--accent);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .t-row {
            display: grid;
            grid-template-columns: clamp(50px, 12vw, 70px) 1fr clamp(80px, 22vw, 110px);
            padding: clamp(8px, 2vw, 12px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.03);
            align-items: center;
            transition: background 0.2s;
            gap: 4px;
          }
          .t-row:last-child { border-bottom: none; }
          .t-row:hover { background: rgba(255, 255, 255, 0.05); }

          .col-date { font-size: clamp(11px, 3vw, 13px); font-weight: 600; color: var(--text-dim); }
          .col-date .d-id { font-size: clamp(9px, 2vw, 10px); opacity: 0.5; margin-top: 2px; }
          
          .col-info { display: flex; flex-direction: column; gap: 2px; padding-right: 4px; overflow: hidden;}
          .info-name { font-size: clamp(12px, 3.5vw, 15px); font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
          .info-sub { font-size: clamp(10px, 2.5vw, 12px); font-weight: 500; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
          
          .col-price { text-align: right; display: flex; flex-direction: column; justify-content: center; overflow: hidden;}
          .price-val { font-size: clamp(12px, 3.5vw, 15px); font-weight: 800; color: var(--text-main); white-space: nowrap;}
          .price-qty { font-size: clamp(10px, 2.5vw, 11px); color: var(--text-dim); margin-top: 2px; font-weight: 600;}

          .empty-state {
            text-align: center;
            padding: clamp(20px, 5vw, 30px) 10px;
            color: var(--text-dim);
            font-style: italic;
            font-size: clamp(12px, 3vw, 14px);
          }
        </style>

        <div class="header">
          ${iconHtml} ${title}
        </div>

        <div class="controls">
          <div class="control-box">
            <ha-icon icon="mdi:calendar-check"></ha-icon>
            <div style="width:100%; overflow:hidden;">
              <div class="cb-label">Năm</div>
              <select id="year-select">
                ${this._availableYears.map(y => `<option value="${y}" ${this._selectedYear === y ? 'selected' : ''}>${y}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="control-box">
            <ha-icon icon="mdi:calendar-month"></ha-icon>
            <div style="width:100%; overflow:hidden;">
              <div class="cb-label">Tháng</div>
              <select id="month-select">
                <option value="all" ${this._selectedMonth === 'all' ? 'selected' : ''}>Cả năm</option>
                ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => 
                  `<option value="${m}" ${this._selectedMonth === m ? 'selected' : ''}>Tháng ${m}</option>`
                ).join('')}
              </select>
            </div>
          </div>
        </div>

        <div style="font-size: clamp(13px, 3.5vw, 16px); font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
          <ha-icon icon="mdi:format-list-bulleted" style="font-size: clamp(16px, 4vw, 18px); color: var(--accent);"></ha-icon> 
          Chi tiết ${this._selectedMonth === 'all' ? `Năm ${this._selectedYear}` : `Tháng ${this._selectedMonth}/${this._selectedYear}`}
        </div>

        <div class="table-wrapper">
          <div class="t-header">
            <div>Ngày</div>
            <div>Thông tin SP</div>
            <div style="text-align: right;">Thành tiền</div>
          </div>
          
          ${this._items.length === 0 ? `
            <div class="empty-state">Không có đơn hàng nào trong thời gian này.</div>
          ` : this._items.map(item => `
            <div class="t-row">
              <div class="col-date">
                <div>${formatDate(item.ngay_mua).split('/')[0]}/${formatDate(item.ngay_mua).split('/')[1]}</div>
                <div class="d-id">ID: ${item.id}</div>
              </div>
              <div class="col-info">
                <div class="info-name">${item.ten_hang}</div>
                <div class="info-sub">${item.model ? item.model + ' | ' : ''}${item.tinh_trang || 'Mới'} | ${item.noi_mua}</div>
              </div>
              <div class="col-price">
                <div class="price-val">${formatMoney(item.thanh_tien_sau_vat)}</div>
                <div class="price-qty">SL: ${item.so_luong}</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="stats-container">
          <div class="stat-line">
            <ha-icon icon="mdi:cash-multiple" style="color: var(--money); font-size: clamp(16px, 4.5vw, 20px);"></ha-icon> 
            Tổng chi tiêu: <strong>${formatMoney(this._stats.total)} ₫</strong>
          </div>
          <div class="stat-line">
            <ha-icon icon="mdi:package-variant-closed" style="color: #fbbf24; font-size: clamp(16px, 4.5vw, 20px);"></ha-icon> 
            Tổng số đơn: <strong class="val-qty">${this._stats.orders} 📦</strong> <span style="font-size: 0.9em; opacity: 0.7;">(${this._stats.items} SP)</span>
          </div>
        </div>
      `;

      this.card.innerHTML = html;
    }
  }

  customElements.define('shopping-history-editor', ShoppingHistoryEditor);
  customElements.define('shopping-history-card', ShoppingHistoryCard);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "shopping-history-card",
    name: "Lịch Sử Mua Sắm",
    description: "Thẻ hiển thị chi tiết lịch sử mua sắm theo dạng Glassmorphism tùy biến.",
    preview: true,
  });
})();
