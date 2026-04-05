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
    constructor() { super(); this._config = {}; }
    setConfig(config) { this._config = config || {}; if (this._rendered) this.updateUI(); }
    set hass(hass) { this._hass = hass; if (!this._rendered) { this.render(); this._rendered = true; } }

    render() {
      if (!this._hass) return;
      const conf = this._config || {};
      const currentTitle = conf.title || "Quản Lý Mua Sắm";
      const currentIcon = conf.icon || "mdi:cart-outline";

      this.innerHTML = `
        <style>
          .editor-container { padding: 12px 0; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
          .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; width: 100%;}
          .row-col { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; width: 100%;}
          .row:last-child, .row-col:last-child { margin-bottom: 0; }
          .label { font-weight: 500; color: var(--primary-text-color); font-size: 14px; min-width: 120px;}
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
          <div class="section"><div class="section-title no-collapse"><div class="title-left">⚙️ Cài đặt chung</div></div><div class="section-content"><div class="row-col"><span class="label">Tiêu đề thẻ</span><input type="text" id="title-input" class="custom-input config-trigger" value="${currentTitle}"></div><div class="row-col"><span class="label">Icon</span><input type="text" id="icon-input" class="custom-input config-trigger" value="${currentIcon}"></div><div class="row"><span class="label">Chiều cao thẻ (px)</span><input type="range" id="card_height" class="config-trigger" min="600" max="1000" step="50"><span class="val-badge" id="card_height_val"></span></div></div></div>
          <div class="section"><div class="section-title"><div class="title-left">🎨 Nền (Background)</div><span class="section-icon">▼</span></div><div class="section-content"><div class="row"><span class="label">Loại nền</span><select id="bg_type" class="ha-select config-trigger"><option value="solid">Màu đơn sắc (Solid)</option><option value="gradient">Màu dải (Gradient)</option></select></div><div class="row"><span class="label">Độ trong suốt (%)</span><input type="range" id="bg_opacity" class="config-trigger" min="0" max="100"><span class="val-badge" id="bg_opacity_val"></span></div><div id="solid_settings" style="margin-top: 16px; border-top: 1px dashed var(--divider-color, #e0e0e0); padding-top: 16px;"><div class="row"><span class="label">Màu nền</span><div class="input-group"><input type="color" id="bg_color" class="config-trigger"><span class="val-badge" id="bg_color_val"></span></div></div></div><div id="gradient_settings" style="display:none;"><div class="row" style="margin-top: 16px; border-top: 1px dashed var(--divider-color, #e0e0e0); padding-top: 16px;"><span class="label">Mẫu Gradient</span><select id="bg_gradient_preset" class="ha-select config-trigger"><option value="linear-gradient(135deg, #f0f4f8, #d9e2ec)">☀️ Sáng mặc định</option><option value="linear-gradient(135deg, #1e293b, #0f172a)">🌙 Tối mặc định</option><option value="linear-gradient(135deg, #141e30, #243b55)">🌌 Royal Night</option><option value="linear-gradient(135deg, #0f2027, #203a43, #2c5364)">🌊 Deep Ocean</option><option value="linear-gradient(135deg, #232526, #414345)">🏙️ Midnight City</option><option value="custom">✍️ Tùy chỉnh (Custom)</option></select></div><div id="custom_gradient_row" style="display:none; flex-direction: column; gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--divider-color, #e0e0e0);"><div class="row" style="width:100%;"><span class="label">Màu 1</span><div class="input-group"><input type="color" id="bg_gradient_color1" class="config-trigger"><span class="val-badge" id="bg_gradient_color1_val"></span></div></div><div class="row" style="width:100%;"><span class="label">Màu 2</span><div class="input-group"><input type="color" id="bg_gradient_color2" class="config-trigger"><span class="val-badge" id="bg_gradient_color2_val"></span></div></div><div class="row" style="width:100%;"><span class="label">Góc độ (°)</span><input type="range" id="bg_gradient_angle" class="config-trigger" min="0" max="360" step="1"><span class="val-badge" id="bg_gradient_angle_val"></span></div></div></div></div></div>
          <div class="section collapsed"><div class="section-title"><div class="title-left">🖋️ Nội dung & Màu sắc</div><div class="title-right"><input type="checkbox" id="auto_contrast" class="config-trigger" title="Tự động tương phản"><span class="section-icon">▼</span></div></div><div class="section-content"><div id="custom_colors_settings"><div class="row"><span class="label">Màu chữ</span><div class="input-group"><input type="color" id="textColor" class="config-trigger"><span class="val-badge" id="textColor_val"></span></div></div><div class="row"><span class="label">Màu Nhấn</span><div class="input-group"><input type="color" id="accentColor" class="config-trigger"><span class="val-badge" id="accentColor_val"></span></div></div><div class="row"><span class="label">Màu Tiền</span><div class="input-group"><input type="color" id="moneyColor" class="config-trigger"><span class="val-badge" id="moneyColor_val"></span></div></div><div class="row"><span class="label">Màu Nền khối</span><div class="input-group"><input type="color" id="blockBg" class="config-trigger"><span class="val-badge" id="blockBg_val"></span></div></div></div></div></div>
          <div class="section collapsed"><div class="section-title"><div class="title-left">🔲 Viền (Border)</div><div class="title-right"><input type="checkbox" id="border_enable" class="config-trigger"><span class="section-icon">▼</span></div></div><div class="section-content"><div id="border_settings"><div class="row"><span class="label">Màu viền</span><div class="input-group"><input type="color" id="border_color" class="config-trigger"><span class="val-badge" id="border_color_val"></span></div></div><div class="row"><span class="label">Độ dày (px)</span><input type="range" id="border_width" class="config-trigger" min="0" max="10" step="1"><span class="val-badge" id="border_width_val"></span></div><div class="row"><span class="label">Trong suốt (%)</span><input type="range" id="border_opacity" class="config-trigger" min="0" max="100"><span class="val-badge" id="border_opacity_val"></span></div></div></div></div>
          <div class="section collapsed"><div class="section-title"><div class="title-left">☁️ Đổ bóng (Shadow)</div><div class="title-right"><input type="checkbox" id="shadow_enable" class="config-trigger"><span class="section-icon">▼</span></div></div><div class="section-content"><div id="shadow_settings"><div class="row"><span class="label">Màu bóng</span><div class="input-group"><input type="color" id="shadow_color" class="config-trigger"><span class="val-badge" id="shadow_color_val"></span></div></div><div class="row"><span class="label">Trong suốt (%)</span><input type="range" id="shadow_opacity" class="config-trigger" min="0" max="100"><span class="val-badge" id="shadow_opacity_val"></span></div><div class="row"><span class="label">Độ nhòe</span><input type="range" id="shadow_blur" class="config-trigger" min="0" max="100"><span class="val-badge" id="shadow_blur_val"></span></div><div class="row"><span class="label">Offset X</span><input type="range" id="shadow_offset_x" class="config-trigger" min="-50" max="50"><span class="val-badge" id="shadow_offset_x_val"></span></div><div class="row"><span class="label">Offset Y</span><input type="range" id="shadow_offset_y" class="config-trigger" min="-50" max="50"><span class="val-badge" id="shadow_offset_y_val"></span></div></div></div></div>
        </div>
      `;
      this.updateUI();
      this.addListeners();
    }

    get _card_height() { return (this._config && this._config.card_height !== undefined) ? this._config.card_height : 600; }
    get _bg_type() { return (this._config && this._config.bg_type) ? this._config.bg_type : 'gradient'; }
    get _bg_color() { return (this._config && this._config.bg_color) ? this._config.bg_color : '#1e293b'; }
    get _bg_opacity() { return (this._config && this._config.bg_opacity !== undefined) ? this._config.bg_opacity : 70; }
    get _bg_gradient_preset() { return (this._config && this._config.bg_gradient_preset) ? this._config.bg_gradient_preset : 'linear-gradient(135deg, #2b5876, #4e4376)'; }
    get _bg_gradient_color1() { return (this._config && this._config.bg_gradient_color1) ? this._config.bg_gradient_color1 : '#1e293b'; }
    get _bg_gradient_color2() { return (this._config && this._config.bg_gradient_color2) ? this._config.bg_gradient_color2 : '#0f172a'; }
    get _bg_gradient_angle() { return (this._config && this._config.bg_gradient_angle !== undefined) ? this._config.bg_gradient_angle : 135; }
    get _border_enable() { return (this._config && this._config.border_enable !== undefined) ? this._config.border_enable : false; }
    get _border_color() { return (this._config && this._config.border_color) ? this._config.border_color : '#ffffff'; }
    get _border_width() { return (this._config && this._config.border_width !== undefined) ? this._config.border_width : 1; }
    get _border_opacity() { return (this._config && this._config.border_opacity !== undefined) ? this._config.border_opacity : 10; }
    get _shadow_enable() { return (this._config && this._config.shadow_enable !== undefined) ? this._config.shadow_enable : false; }
    get _shadow_color() { return (this._config && this._config.shadow_color) ? this._config.shadow_color : '#000000'; }
    get _shadow_opacity() { return (this._config && this._config.shadow_opacity !== undefined) ? this._config.shadow_opacity : 20; }
    get _shadow_blur() { return (this._config && this._config.shadow_blur !== undefined) ? this._config.shadow_blur : 32; }
    get _shadow_offset_x() { return (this._config && this._config.shadow_offset_x !== undefined) ? this._config.shadow_offset_x : 0; }
    get _shadow_offset_y() { return (this._config && this._config.shadow_offset_y !== undefined) ? this._config.shadow_offset_y : 8; }
    get _auto_contrast() { return (this._config && this._config.auto_contrast !== undefined) ? this._config.auto_contrast : true; }
    get _textColor() { return (this._config && this._config.textColor) ? this._config.textColor : '#f8fafc'; }
    get _accentColor() { return (this._config && this._config.accentColor) ? this._config.accentColor : '#0ea5e9'; }
    get _moneyColor() { return (this._config && this._config.moneyColor) ? this._config.moneyColor : '#38bdf8'; }
    get _blockBg() { return (this._config && this._config.blockBg) ? this._config.blockBg : '#1e293b'; }

    updateUI() {
      if (!this.querySelector('#bg_type')) return;
      this.querySelector('#card_height').value = this._card_height;
      if(this.querySelector('#card_height_val')) this.querySelector('#card_height_val').textContent = this._card_height + 'px';
      this.querySelector('#bg_type').value = this._bg_type;
      this.querySelector('#bg_opacity').value = this._bg_opacity;
      if(this.querySelector('#bg_opacity_val')) this.querySelector('#bg_opacity_val').textContent = this._bg_opacity + '%';
      if (this._bg_type === 'gradient') {
        this.querySelector('#solid_settings').style.display = 'none';
        this.querySelector('#gradient_settings').style.display = 'block';
      } else {
        this.querySelector('#solid_settings').style.display = 'block';
        this.querySelector('#gradient_settings').style.display = 'none';
      }
      this.querySelector('#bg_color').value = this._bg_color;
      if(this.querySelector('#bg_color_val')) this.querySelector('#bg_color_val').textContent = this._bg_color.toUpperCase();
      this.querySelector('#bg_gradient_preset').value = this._bg_gradient_preset;
      if (this._bg_gradient_preset === 'custom') {
        this.querySelector('#custom_gradient_row').style.display = 'flex';
      } else {
        this.querySelector('#custom_gradient_row').style.display = 'none';
      }
      this.querySelector('#bg_gradient_color1').value = this._bg_gradient_color1;
      if(this.querySelector('#bg_gradient_color1_val')) this.querySelector('#bg_gradient_color1_val').textContent = this._bg_gradient_color1.toUpperCase();
      this.querySelector('#bg_gradient_color2').value = this._bg_gradient_color2;
      if(this.querySelector('#bg_gradient_color2_val')) this.querySelector('#bg_gradient_color2_val').textContent = this._bg_gradient_color2.toUpperCase();
      this.querySelector('#bg_gradient_angle').value = this._bg_gradient_angle;
      if(this.querySelector('#bg_gradient_angle_val')) this.querySelector('#bg_gradient_angle_val').textContent = this._bg_gradient_angle + '°';
      const borderCheckbox = this.querySelector('#border_enable');
      if (borderCheckbox) borderCheckbox.checked = this._border_enable;
      this.querySelector('#border_settings').style.display = this._border_enable ? 'block' : 'none';
      this.querySelector('#border_color').value = this._border_color;
      if(this.querySelector('#border_color_val')) this.querySelector('#border_color_val').textContent = this._border_color.toUpperCase();
      this.querySelector('#border_width').value = this._border_width;
      if(this.querySelector('#border_width_val')) this.querySelector('#border_width_val').textContent = this._border_width + 'px';
      this.querySelector('#border_opacity').value = this._border_opacity;
      if(this.querySelector('#border_opacity_val')) this.querySelector('#border_opacity_val').textContent = this._border_opacity + '%';
      this.querySelector('#shadow_enable').checked = this._shadow_enable;
      this.querySelector('#shadow_settings').style.display = this._shadow_enable ? 'block' : 'none';
      this.querySelector('#shadow_color').value = this._shadow_color;
      if(this.querySelector('#shadow_color_val')) this.querySelector('#shadow_color_val').textContent = this._shadow_color.toUpperCase();
      this.querySelector('#shadow_opacity').value = this._shadow_opacity;
      if(this.querySelector('#shadow_opacity_val')) this.querySelector('#shadow_opacity_val').textContent = this._shadow_opacity + '%';
      this.querySelector('#shadow_blur').value = this._shadow_blur;
      if(this.querySelector('#shadow_blur_val')) this.querySelector('#shadow_blur_val').textContent = this._shadow_blur + 'px';
      this.querySelector('#shadow_offset_x').value = this._shadow_offset_x;
      if(this.querySelector('#shadow_offset_x_val')) this.querySelector('#shadow_offset_x_val').textContent = this._shadow_offset_x + 'px';
      this.querySelector('#shadow_offset_y').value = this._shadow_offset_y;
      if(this.querySelector('#shadow_offset_y_val')) this.querySelector('#shadow_offset_y_val').textContent = this._shadow_offset_y + 'px';
      this.querySelector('#auto_contrast').checked = this._auto_contrast;
      if (this._auto_contrast) {
          this.querySelector('#custom_colors_settings').style.opacity = '0.4';
          this.querySelector('#custom_colors_settings').style.pointerEvents = 'none';
      } else {
          this.querySelector('#custom_colors_settings').style.opacity = '1';
          this.querySelector('#custom_colors_settings').style.pointerEvents = 'auto';
      }
      this.querySelector('#textColor').value = this._textColor;
      if(this.querySelector('#textColor_val')) this.querySelector('#textColor_val').textContent = this._textColor.toUpperCase();
      this.querySelector('#accentColor').value = this._accentColor;
      if(this.querySelector('#accentColor_val')) this.querySelector('#accentColor_val').textContent = this._accentColor.toUpperCase();
      this.querySelector('#moneyColor').value = this._moneyColor;
      if(this.querySelector('#moneyColor_val')) this.querySelector('#moneyColor_val').textContent = this._moneyColor.toUpperCase();
      this.querySelector('#blockBg').value = this._blockBg;
      if(this.querySelector('#blockBg_val')) this.querySelector('#blockBg_val').textContent = this._blockBg.toUpperCase();
    }

    addListeners() {
      const dispatchUpdate = () => {
        let newConfig = { 
            ...this._config,
            title: this.querySelector('#title-input').value,
            icon: this.querySelector('#icon-input').value,
            card_height: parseInt(this.querySelector('#card_height').value, 10),
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
        if (el.tagName === 'SELECT') { el.addEventListener('change', dispatchUpdate); } 
        else { el.addEventListener('input', dispatchUpdate); el.addEventListener('change', dispatchUpdate); }
      });

      this.querySelectorAll('.section-title:not(.no-collapse)').forEach(titleEl => {
        const inputs = titleEl.querySelectorAll('input, select, button');
        inputs.forEach(input => input.addEventListener('click', (e) => e.stopPropagation()));
        titleEl.addEventListener('click', () => titleEl.closest('.section').classList.toggle('collapsed'));
      });
    }
  }

  // ==========================================
  // 2. LỚP HIỂN THỊ GIAO DIỆN THẺ (CARD)
  // ==========================================
  class ShoppingHistoryCard extends HTMLElement {
    static getConfigElement() { return document.createElement('shopping-history-editor'); }
    static getStubConfig(hass) { 
      return { 
        title: "Quản Lý Mua Sắm", 
        icon: "mdi:cart-outline", 
        card_height: 600,
        bg_opacity: 70, 
        bg_gradient_preset: 'linear-gradient(135deg, #2b5876, #4e4376)',
        auto_contrast: true,
        border_enable: false,
        shadow_enable: false
      }; 
    }

    getCardSize() { return 3; }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
      
      const now = new Date();
      this._selectedYear = now.getFullYear();
      this._selectedMonth = 'all'; 
      
      this._profilesData = {}; 
      this._profileList = []; 
      this._currentProfileId = null; 
      
      this._availableYears = [];
      this._availableMonths = []; 
      
      this._allProfileItems = []; 
      this._items = [];
      this._stats = { orders: 0, items: 0, total: 0 };
      
      this._activeTab = 'history'; 
      this._searchKeyword = '';
      this._warrantyDays = 30; 

      this._itemsPerPage = 10;
      this._historyPage = 1;
      this._searchPage = 1;
      this._warrantyPage = 1;

      this._entryIds = {}; 
      
      this._uniqueCategories = new Set();
      this._uniquePlaces = new Set();
      this._uniqueManufacturers = new Set();
      
      this._expandedOrderId = null; 
      this._itemToDelete = null;
      this._editingOrder = null;

      this._configEntriesMap = {};
      this._entityRegistryMap = {};
      this._isScanning = false;
      this._skeletonBuilt = false;
    }

    // --- CÁC HÀM QUẢN LÝ VÒNG ĐỜI MỚI THÊM ĐỂ CHỐNG LỖI ---
    connectedCallback() {
        if (this._config && !this._skeletonBuilt) {
            this.renderInit();
            this.updateTheme();
            this.renderHeaderAndTabs();
        }
    }

    disconnectedCallback() {
        // Hủy các tiến trình ngầm nếu thẻ bị người dùng ẩn/tắt đi
        this._isScanning = false;
    }
    // ----------------------------------------------------

    setConfig(config) {
      if (!config) throw new Error("Cấu hình không hợp lệ");
      this._config = config;
      this.renderInit();
      this.updateTheme();
      this.renderHeaderAndTabs();
      if (this._hass) this.updateData();
    }

    set hass(hass) {
      try {
          if (!hass || !hass.states) return; 
          
          const oldHass = this._hass;
          this._hass = hass;
          
          if (!oldHass) {
            if (!this._isScanning) {
                this._isScanning = true;
                this.performFullScan().then(() => { this._isScanning = false; }).catch((err) => { console.error(err); this._isScanning = false; });
            }
          } else {
            if (this._isScanning) return; 
            if (!oldHass || !oldHass.states) return;
            
            let shouldUpdate = false;
            const relevantSensors = Object.keys(hass.states).filter(k => 
                k.startsWith('sensor.') && 
                hass.states[k].attributes && hass.states[k].attributes.danh_sach_chi_tiet !== undefined && 
                hass.states[k].attributes.nam !== undefined
            );
            const oldRelevantSensors = Object.keys(oldHass.states).filter(k => 
                k.startsWith('sensor.') && 
                oldHass.states[k].attributes && oldHass.states[k].attributes.danh_sach_chi_tiet !== undefined && 
                oldHass.states[k].attributes.nam !== undefined
            );

            if (relevantSensors.length !== oldRelevantSensors.length) {
                shouldUpdate = true;
            } else {
                for (let eid of relevantSensors) {
                    if (oldHass.states[eid] !== hass.states[eid]) {
                        shouldUpdate = true;
                        break;
                    }
                }
            }
            
            if (shouldUpdate) {
                this._isScanning = true;
                this.performFullScan().then(() => { this._isScanning = false; }).catch((err) => { console.error(err); this._isScanning = false; });
            }
          }
      } catch (e) {
          console.warn("Shopping History Card: Lỗi trong quá trình nhận hass", e);
      }
    }

    async performFullScan() {
      if (!this._hass || !this._hass.states) return;

      let shoppingEntries = [];
      try {
          const entries = await this._hass.callWS({ type: 'config_entries/get' });
          if (!this.isConnected) return; // Dừng lại nếu thẻ đã bị tắt mất

          this._configEntriesMap = {};
          shoppingEntries = entries.filter(e => e.domain === 'shopping_history');
          shoppingEntries.forEach(e => { this._configEntriesMap[e.entry_id] = e.title; });

          const entities = await this._hass.callWS({ type: 'config/entity_registry/list' });
          if (!this.isConnected) return; // Kiểm tra lại lần nữa

          this._entityRegistryMap = {};
          entities.forEach(ent => { this._entityRegistryMap[ent.entity_id] = ent.config_entry_id; });
      } catch (err) {
          console.warn("Shopping History: Không thể kết nối API HA WebSocket. Sẽ dùng fallback.", err);
      }

      if (!this.isConnected) return;

      const yearSensors = Object.keys(this._hass.states).filter(eid => 
        eid.startsWith('sensor.') && 
        this._hass.states[eid].attributes && this._hass.states[eid].attributes.danh_sach_chi_tiet !== undefined && 
        this._hass.states[eid].attributes.nam !== undefined
      );

      this._uniqueCategories.clear();
      this._uniquePlaces.clear();
      this._uniqueManufacturers.clear();

      const tempGroups = {};

      shoppingEntries.forEach(e => {
          tempGroups[e.entry_id] = { years: new Set(), map: {}, displayNames: [e.title] };
      });

      yearSensors.forEach(eid => {
        const state = this._hass.states[eid];
        const y = parseInt(state.attributes ? state.attributes.nam : undefined);
        
        if (state.attributes && state.attributes.danh_sach_chi_tiet) {
            state.attributes.danh_sach_chi_tiet.forEach(item => {
                if (item.nganh_hang) this._uniqueCategories.add(item.nganh_hang.trim());
                if (item.noi_mua) this._uniquePlaces.add(item.noi_mua.trim());
                if (item.hang_sx) this._uniqueManufacturers.add(item.hang_sx.trim());
            });
        }
        
        if (!isNaN(y)) {
            let groupId = this._entityRegistryMap[eid] || 
                          (this._hass.entities && this._hass.entities[eid] ? this._hass.entities[eid].config_entry_id : null) ||
                          (state.attributes ? state.attributes.config_entry_id : null);

            if (!groupId) {
                let baseName = (state.attributes && state.attributes.friendly_name) ? state.attributes.friendly_name : eid;
                groupId = baseName.replace(/\s*(?:Năm|Year|-|_)?\s*\d{4}$/i, '').trim();
            }

            if (!tempGroups[groupId]) { 
                tempGroups[groupId] = { years: new Set(), map: {}, displayNames: [] }; 
            }
            tempGroups[groupId].years.add(y);
            tempGroups[groupId].map[y] = eid;
            
            let pName = (state.attributes && state.attributes.friendly_name) ? state.attributes.friendly_name : eid;
            pName = pName.replace(/\s*(?:Năm|Year|-|_)?\s*\d{4}$/i, '').trim();
            tempGroups[groupId].displayNames.push(pName);
        }
      });

      this._profilesData = {};
      this._profileList = [];

      Object.keys(tempGroups).forEach(gId => {
          const group = tempGroups[gId];
          let finalName = this._configEntriesMap[gId];
          
          if (!finalName) {
              if (group.displayNames.length > 0) {
                  const nameCounts = group.displayNames.reduce((acc, name) => {
                      acc[name] = (acc[name] || 0) + 1;
                      return acc;
                  }, {});
                  finalName = Object.keys(nameCounts).reduce((a, b) => nameCounts[a] > nameCounts[b] ? a : b);
              }
          }
          if (!finalName) finalName = gId; 

          let counter = 1;
          let uniqueName = finalName;
          while (this._profileList.some(p => p.name === uniqueName)) {
             uniqueName = `${finalName} (${counter})`;
             counter++;
          }

          this._profilesData[gId] = { id: gId, name: uniqueName, years: group.years, map: group.map };
          this._profileList.push(this._profilesData[gId]);
      });

      this._profileList.sort((a, b) => a.name.localeCompare(b.name));
      
      if (!this._currentProfileId || !this._profilesData[this._currentProfileId]) {
          if (this._profileList.length > 0) {
              this._currentProfileId = this._profileList[0].id;
              this._selectedMonth = 'all'; 
          } else {
              this._currentProfileId = null;
          }
      }

      if (this._currentProfileId && this._profilesData[this._currentProfileId]) {
          this._availableYears = Array.from(this._profilesData[this._currentProfileId].years).sort((a, b) => b - a);
          if (!this._availableYears.includes(this._selectedYear) && this._availableYears.length > 0) {
              this._selectedYear = this._availableYears[0];
              this._selectedMonth = 'all';
          }
      } else {
          this._availableYears = [];
      }

      this.updateData();
    }

    updateData() {
      // Chỉ cập nhật dữ liệu DOM nếu thẻ đang được hiển thị (isConnected = true)
      if (!this._hass || !this._hass.states || !this.isConnected) return;

      this._items = [];
      this._allProfileItems = [];
      this._stats = { orders: 0, items: 0, total: 0 };
      this._availableMonths = [];
      
      if (!this._currentProfileId || !this._profilesData[this._currentProfileId]) { 
          this.renderHeaderAndTabs();
          this.renderContent();
          return; 
      }
      
      const currentProf = this._profilesData[this._currentProfileId];

      Object.values(currentProf.map).forEach(eid => {
          const state = this._hass.states[eid];
          if (state && state.attributes && state.attributes.danh_sach_chi_tiet) {
              this._allProfileItems.push(...state.attributes.danh_sach_chi_tiet);
          }
      });
      this._allProfileItems.sort((a, b) => new Date(b.ngay_mua || 0) - new Date(a.ngay_mua || 0));

      const yearEid = currentProf.map[this._selectedYear];
      if (yearEid) {
          const yearState = this._hass.states[yearEid];
          if (yearState && yearState.attributes && yearState.attributes.danh_sach_chi_tiet) {
              const allItems = yearState.attributes.danh_sach_chi_tiet;
              const mSet = new Set();
              allItems.forEach(i => { if(i.thang) mSet.add(parseInt(i.thang)); });
              this._availableMonths = Array.from(mSet).sort((a,b) => a - b); 
              
              if (this._selectedMonth === 'all' || !this._availableMonths.includes(parseInt(this._selectedMonth))) {
                  this._selectedMonth = 'all';
                  this._items = [...allItems];
                  this._stats.orders = yearState.attributes.tong_don_hang || allItems.length;
                  this._stats.items = yearState.attributes.tong_so_luong || allItems.reduce((sum, item) => sum + (item.so_luong || 0), 0);
                  this._stats.total = yearState.attributes.tong_tien || allItems.reduce((sum, item) => sum + (item.thanh_tien_sau_vat || 0), 0);
              } else {
                  this._items = allItems.filter(item => parseInt(item.thang) === parseInt(this._selectedMonth));
                  this._stats.orders = this._items.length;
                  this._stats.items = this._items.reduce((sum, item) => sum + (item.so_luong || 0), 0);
                  this._stats.total = this._items.reduce((sum, item) => sum + (item.thanh_tien_sau_vat || 0), 0);
              }
          }
      }

      this._items.sort((a, b) => new Date(b.ngay_mua || 0) - new Date(a.ngay_mua || 0));
      
      this.renderHeaderAndTabs();
      this.renderContent();
    }

    getDaysUntilExpiry(endDateStr) {
      if (!endDateStr) return null;
      const end = new Date(endDateStr);
      if (isNaN(end.getTime())) return null;
      const now = new Date();
      now.setHours(0,0,0,0); end.setHours(0,0,0,0);
      return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    checkWarrantyStatus(endDateStr) {
      const diffDays = this.getDaysUntilExpiry(endDateStr);
      if (diffDays === null) return { text: endDateStr || '--', class: '' };
      if (diffDays < 0) return { text: formatDate(endDateStr) + ' (Hết BH)', class: 'expired-warranty' };
      if (diffDays <= 30) return { text: formatDate(endDateStr), class: 'expiring-soon' };
      return { text: formatDate(endDateStr), class: 'valid-warranty' };
    }

    renderInit() {
      if (!this.card) {
        this.card = document.createElement('ha-card');
        this.shadowRoot.appendChild(this.card);
        
        this.card.innerHTML = `
          <div id="c-header" class="header"></div>
          <div id="c-topbar" class="top-bar"></div>
          <div id="c-tabs" class="tabs"></div>
          <div id="c-content" class="tab-content-area"></div>
          <div id="c-modal"></div>
        `;
        
        this._els = {
            header: this.card.querySelector('#c-header'),
            topbar: this.card.querySelector('#c-topbar'),
            tabs: this.card.querySelector('#c-tabs'),
            content: this.card.querySelector('#c-content'),
            modal: this.card.querySelector('#c-modal')
        };
        
        this.attachGlobalListeners();
        this.injectStaticCSS();
        this._skeletonBuilt = true;
      }
    }

    injectStaticCSS() {
        const style = document.createElement('style');
        style.textContent = `
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px; }
          ::-webkit-scrollbar-thumb:hover { background: var(--accent); }

          .header { display: flex; align-items: center; gap: 12px; font-size: clamp(18px, 5vw, 22px); font-weight: 700; margin-bottom: 12px; color: var(--text-main); flex-shrink: 0;}
          .header ha-icon, .header .emoji-icon { color: var(--text-main); opacity: 0.9; }

          .top-bar { display: flex; gap: 8px; margin-bottom: 12px; flex-shrink: 0; align-items: stretch; height: 36px; width: 100%; box-sizing: border-box;}
          .profile-selector { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.15); border-radius: 12px; padding: 0 8px; border: 1px solid var(--glass-border); margin: 0;}
          .profile-info-wrapper { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 6px; overflow: hidden; }
          .profile-selector select { background: transparent; border: none; color: var(--accent); font-weight: 500; font-size: clamp(13px, 3.5vw, 16px); text-align: center; flex: 1; min-width: 0; outline: none; cursor: pointer; appearance: none; -webkit-appearance: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 2px;}
          .profile-selector select option { background: var(--option-bg); color: var(--text-main); }
          .profile-nav { color: var(--text-main); cursor: pointer; padding: 4px; transition: 0.2s; font-size: 24px; flex-shrink: 0;}
          .profile-nav:hover { color: var(--accent); transform: scale(1.1); }
          
          .search-tab-btn { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.1); color: var(--text-dim); font-weight: 600; cursor: pointer; transition: 0.2s; user-select: none; font-size: clamp(12px, 3.5vw, 14px); white-space: nowrap;}
          .search-tab-btn.active { background: var(--accent); color: #fff; border-color: transparent; box-shadow: 0 2px 4px rgba(0,0,0,0.2);}
          .search-tab-btn:hover:not(.active) { background: var(--block-bg); color: var(--text-main); }
          
          @media (max-width: 420px) { .st-text { display: none; } .search-tab-btn { padding: 0 10px; } }

          .tabs { display: flex; gap: 8px; margin-bottom: 12px; background: rgba(0,0,0,0.1); padding: 4px; border-radius: 12px; border: 1px solid var(--glass-border); flex-shrink: 0;}
          .tabs .tab { flex: 1; text-align: center; padding: 8px 4px; border-radius: 8px; font-size: clamp(12px, 3.5vw, 14px); font-weight: 600; color: var(--text-dim); cursor: pointer; transition: all 0.2s; user-select: none; }
          .tabs .tab.active { background: var(--accent); color: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
          .tabs .tab:hover:not(.active) { background: var(--block-bg); color: var(--text-main); }

          .tab-content-area { display: flex; flex-direction: column; flex: 1; overflow: hidden; }

          .controls { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(8px, 2vw, 12px); margin-bottom: 12px; flex-shrink: 0;}
          .control-box { background: var(--block-bg); border: 1px solid var(--glass-border); border-radius: 12px; padding: clamp(4px, 1.5vw, 6px) clamp(8px, 2vw, 12px); display: flex; align-items: center; justify-content: space-between; gap: 4px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }
          .control-box select { background: transparent; border: none; color: var(--text-main); font-size: clamp(14px, 3.5vw, 16px); font-weight: 700; flex: 1; text-align: center; text-align-last: center; outline: none; cursor: pointer; appearance: none; -webkit-appearance: none; padding: 4px 0; }
          .control-box select option { background-color: var(--option-bg); color: var(--text-main); }
          .nav-btn { color: var(--text-dim); cursor: pointer; transition: 0.2s; font-size: 24px; }
          .nav-btn:hover:not(.disabled) { color: var(--accent); transform: scale(1.1); }
          .nav-btn.disabled { opacity: 0.2; pointer-events: none; }

          .stats-container { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--glass-border); display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;}
          .stat-line { display: flex; align-items: center; gap: 8px; font-size: clamp(12px, 3.5vw, 14px); color: var(--text-dim); font-weight: 500; }
          .stat-line strong { color: var(--money); font-size: clamp(14px, 4vw, 16px); font-weight: 800; }
          .stat-line .val-qty { color: #fbbf24; }

          .table-container { background: var(--block-bg); border-radius: 12px; border: 1px solid var(--glass-border); overflow: hidden; display: flex; flex-direction: column; flex: 1; margin-top: 12px;}
          
          .t-header { flex-shrink: 0; display: grid; grid-template-columns: clamp(50px, 12vw, 75px) 1fr clamp(75px, 21vw, 110px) 36px; padding: clamp(8px, 2vw, 12px); background: rgba(0, 0, 0, 0.15); border-bottom: 1px solid var(--glass-border); font-size: clamp(10px, 2.5vw, 12px); font-weight: 800; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px; }
          .t-header.search-header, .t-header.warranty-header { grid-template-columns: clamp(55px, 14vw, 80px) 1fr clamp(80px, 22vw, 110px); }
          
          .table-wrapper { flex: 1; overflow: auto; } 

          .t-row-container { border-bottom: 1px solid rgba(255, 255, 255, 0.03); }
          .t-row-container:last-child { border-bottom: none; }
          
          .t-row { display: grid; grid-template-columns: clamp(50px, 12vw, 75px) 1fr clamp(75px, 21vw, 110px) 36px; padding: clamp(6px, 1.5vw, 10px); align-items: center; transition: background 0.2s; gap: 4px; cursor: pointer; }
          .search-header ~ .table-wrapper .t-row, .warranty-header ~ .table-wrapper .t-row { grid-template-columns: clamp(55px, 14vw, 80px) 1fr clamp(80px, 22vw, 110px); }

          .t-row:hover { background: rgba(255, 255, 255, 0.08); }
          .t-row.expanded { background: rgba(0, 0, 0, 0.15); }
          
          .col-date { font-size: clamp(11px, 3vw, 13px); font-weight: 600; color: var(--text-dim); pointer-events: none;}
          .col-date .d-id { font-size: clamp(9px, 2vw, 10px); opacity: 0.5; margin-top: 2px; }
          .col-info { display: flex; flex-direction: column; gap: 2px; padding-right: 4px; overflow: hidden; pointer-events: none;}
          .info-name { font-size: clamp(12px, 3.5vw, 15px); font-weight: 700; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
          .info-sub { font-size: clamp(10px, 2.5vw, 12px); font-weight: 500; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
          
          .warranty-date.expired-warranty { opacity: 0.5; text-decoration: line-through; }
          .warranty-date.valid-warranty { color: var(--accent); font-weight: 600; }
          .warranty-date.expiring-soon { font-weight: 800; animation: pulse-danger 1.5s infinite; }
          @keyframes pulse-danger { 0% { color: #facc15; text-shadow: 0 0 5px rgba(250, 204, 21, 0.4); } 50% { color: #ef4444; text-shadow: 0 0 12px rgba(239, 68, 68, 0.8); } 100% { color: #facc15; text-shadow: 0 0 5px rgba(250, 204, 21, 0.4); } }

          .col-price { text-align: right; display: flex; flex-direction: column; justify-content: center; overflow: hidden; pointer-events: none;}
          .price-val { font-size: clamp(12px, 3.5vw, 15px); font-weight: 800; color: var(--text-main); white-space: nowrap;}
          .price-qty { font-size: clamp(10px, 2.5vw, 11px); color: var(--text-dim); margin-top: 2px; font-weight: 600;}
          
          .col-action { display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 2; gap: 4px; padding-right: 2px;}
          .btn-delete, .btn-edit { opacity: 0.6; cursor: pointer; transition: 0.2s; font-size: 10px; padding: 2px; line-height: 1; }
          .btn-delete { color: #ef4444; }
          .btn-edit { color: var(--accent); }
          .btn-delete:hover, .btn-edit:hover { opacity: 1; transform: scale(1.1);}

          .row-details { background: rgba(0,0,0,0.2); padding: 6px 10px; color: var(--text-main); border-top: 1px dashed var(--glass-border); box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
          .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; }
          .d-item { display: flex; flex-direction: column; }
          .d-lbl { font-size: 9px; color: var(--text-dim); text-transform: uppercase; font-weight: 600;}
          .d-val { font-size: 11px; font-weight: 500; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
          .slide-down { animation: slideDownFast 0.2s ease-out forwards; transform-origin: top; }
          @keyframes slideDownFast { from { opacity: 0; transform: scaleY(0.9); } to { opacity: 1; transform: scaleY(1); } }

          .pagination-container { display: flex; justify-content: center; align-items: center; gap: 12px; padding: 6px; border-top: 1px solid var(--glass-border); background: rgba(0,0,0,0.15); flex-shrink: 0;}
          .page-btn { cursor: pointer; color: var(--text-main); opacity: 0.6; transition: 0.2s; font-size: 24px; padding: 2px; border-radius: 4px; }
          .page-btn:hover:not(.disabled) { opacity: 1; color: var(--accent); background: rgba(255,255,255,0.05); }
          .page-btn.disabled { opacity: 0.15; cursor: default; }
          .page-info { font-size: 11px; font-weight: 700; color: var(--text-dim); background: rgba(0,0,0,0.2); padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); }

          .search-tab-content { display: flex; flex-direction: column; flex: 1; overflow-y: auto; padding-right: 4px;}
          .search-box { background: var(--block-bg); border-radius: 12px; padding: 12px; border: 1px solid var(--glass-border); flex-shrink:0; margin-bottom: 12px; }
          .s-input-group { display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.15); padding: 8px 12px; border-radius: 8px; border: 1px solid var(--glass-border); transition: 0.2s;}
          .s-input-group:focus-within { border-color: var(--accent); background: rgba(0,0,0,0.25); }
          .s-input-group ha-icon { color: var(--text-dim); }
          .s-input-group input { flex: 1; background: transparent; border: none; outline: none; color: var(--text-main); font-size: 14px; font-family: inherit;}
          .clear-icon { cursor: pointer; color: var(--text-dim) !important; transition: 0.2s; }
          .clear-icon:hover { color: #ef4444 !important; }

          .warranty-box { background: var(--block-bg); border-radius: 12px; padding: 16px; border: 1px solid var(--glass-border); flex-shrink:0; margin-bottom: 16px; }
          .w-header { font-size: 14px; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 8px; margin-bottom: 16px;}
          .w-header ha-icon { color: #facc15; }
          .w-hl { color: var(--accent); font-weight: 800; font-size: 16px;}
          
          .w-slider-container { width: 100%; position: relative;}
          .modern-slider { -webkit-appearance: none; width: 100%; height: 8px; border-radius: 4px; outline: none; opacity: 0.9; transition: opacity .2s; margin: 10px 0; background: rgba(255,255,255,0.1); }
          .modern-slider:hover { opacity: 1; }
          .modern-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; border-radius: 50%; background: var(--accent); cursor: pointer; border: 4px solid rgba(255,255,255,0.85); box-shadow: 0 2px 6px rgba(0,0,0,0.3); transition: transform 0.1s; }
          .modern-slider::-webkit-slider-thumb:hover { transform: scale(1.15); }
          .modern-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--accent); cursor: pointer; border: 4px solid rgba(255,255,255,0.85); box-shadow: 0 2px 6px rgba(0,0,0,0.3); transition: transform 0.1s; }
          .modern-slider::-moz-range-thumb:hover { transform: scale(1.15); }

          .w-ticks { display: flex; justify-content: space-between; padding: 0 4px; margin-top: 8px; font-size: 10px; color: var(--text-dim); font-weight: 600;}

          .custom-modal-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; border-radius: var(--ha-card-border-radius, 16px); }
          .custom-modal { background: var(--block-bg); border: 1px solid var(--glass-border); padding: 24px; border-radius: 16px; width: 85%; max-width: 300px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); color: var(--text-main); }
          .custom-modal h3 { margin: 0 0 12px 0; font-size: 18px; color: var(--text-main); }
          .custom-modal p { margin: 0 0 20px 0; font-size: 14px; color: var(--text-dim); line-height: 1.4; }
          .modal-actions { display: flex; gap: 12px; justify-content: center; }
          .btn-modal-cancel, .btn-modal-confirm { flex: 1; padding: 10px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-family: inherit; transition: 0.2s; font-size: 14px; }
          .btn-modal-cancel { background: rgba(255,255,255,0.1); color: var(--text-main); }
          .btn-modal-cancel:hover { background: rgba(255,255,255,0.2); }
          .btn-modal-confirm { background: #ef4444; color: white; }
          .btn-modal-confirm:hover { background: #dc2626; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(239,68,68,0.3); }

          .add-tab-wrapper { overflow-y: auto; flex: 1; padding-right: 4px;}
          form { background: var(--block-bg); border-radius: 12px; padding: 16px; border: 1px solid var(--glass-border); }
          .form-title { font-size: 16px; font-weight: 700; color: var(--accent); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;}
          .form-row { margin-bottom: 12px; }
          .form-row.split { display: flex; gap: 12px; }
          
          .f-group { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
          .f-group label { font-size: 12px; font-weight: 600; color: var(--text-dim); }
          .f-group input, .f-group select, .f-group textarea { width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.15); border: 1px solid var(--glass-border); color: var(--text-main); padding: 10px 12px; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; font-family: inherit;}
          .f-group input:focus, .f-group select:focus, .f-group textarea:focus { border-color: var(--accent); background: rgba(0,0,0,0.25); }
          
          input::-webkit-calendar-picker-indicator { opacity: 0.5; filter: invert(0.8); cursor: pointer; }
          input:hover::-webkit-calendar-picker-indicator { opacity: 1; }
          .f-group select option { background: var(--option-bg); color: var(--text-main); }
          .form-details-toggle { font-size: 13px; color: var(--accent); text-align: center; cursor: pointer; margin: 8px 0; display: flex; justify-content: center; align-items: center; gap: 4px; opacity: 0.8;}
          .form-details-toggle:hover { opacity: 1; }
          .btn-primary { background: var(--accent); color: #fff; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; font-family: inherit;}
          .btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
          
          .empty-state-nice { text-align: center; padding: 32px 16px; display: flex; flex-direction: column; align-items: center; gap: 12px;}
          .empty-state-nice ha-icon { font-size: 64px; color: var(--text-dim); opacity: 0.5; margin-bottom: 8px;}
          .empty-title { font-size: 18px; font-weight: 700; color: var(--text-main); }
          .empty-sub { font-size: 14px; color: var(--text-dim); margin-bottom: 16px; max-width: 80%; line-height: 1.4;}

          .fade-in { animation: fadeIn 0.3s ease-out forwards; }
          .fade-in-fast { animation: fadeIn 0.15s ease-out forwards; }
          .zoom-in { animation: zoomIn 0.2s ease-out forwards; }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes zoomIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        `;
        this.shadowRoot.appendChild(style);
    }

    attachGlobalListeners() {
        this.card.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab[data-target]');
            if (tab) { this.switchTab(tab.dataset.target); return; }
            
            const searchBtn = e.target.closest('.search-tab-btn');
            if (searchBtn) { this.switchTab('search'); return; }

            const pageBtn = e.target.closest('.page-btn:not(.disabled)');
            if (pageBtn) {
                const type = pageBtn.dataset.type;
                const page = parseInt(pageBtn.dataset.page);
                if (type === 'history') { this._historyPage = page; this.renderHistoryDynamic(); }
                if (type === 'search') { this._searchPage = page; this.renderSearchDynamic(); }
                if (type === 'warranty') { this._warrantyPage = page; this.renderSearchDynamic(); }
                return;
            }

            const btnDelete = e.target.closest('.btn-delete');
            if (btnDelete) {
                e.stopPropagation();
                this.openDeleteModal(parseInt(btnDelete.dataset.id));
                return;
            }

            const btnEdit = e.target.closest('.btn-edit');
            if (btnEdit) {
                e.stopPropagation();
                this.startEdit(parseInt(btnEdit.dataset.id));
                return;
            }

            const tRow = e.target.closest('.t-row');
            const rowDetails = e.target.closest('.row-details');

            if (!tRow && !rowDetails) {
                this.card.querySelectorAll('.t-row.expanded').forEach(r => {
                    r.classList.remove('expanded');
                    const d = r.nextElementSibling;
                    if (d && d.classList.contains('row-details')) d.style.display = 'none';
                });
                this._expandedOrderId = null;
            }

            if (tRow) {
                const isExpanded = tRow.classList.contains('expanded');
                const details = tRow.nextElementSibling;

                this.card.querySelectorAll('.t-row.expanded').forEach(r => {
                    if (r !== tRow) {
                        r.classList.remove('expanded');
                        const d = r.nextElementSibling;
                        if (d && d.classList.contains('row-details')) d.style.display = 'none';
                    }
                });

                if (!isExpanded) {
                    tRow.classList.add('expanded');
                    if (details && details.classList.contains('row-details')) details.style.display = 'block';
                    this._expandedOrderId = parseInt(tRow.dataset.id);
                } else {
                    tRow.classList.remove('expanded');
                    if (details && details.classList.contains('row-details')) details.style.display = 'none';
                    this._expandedOrderId = null;
                }
                return;
            }

            if (e.target.closest('#btn-empty-add')) { this.switchTab('add'); return; }

            if (e.target.closest('#btn-cancel-edit')) {
                this._editingOrder = null;
                this.renderContent();
                return;
            }

            if (e.target.closest('#btn-search-edit')) {
                const idInput = this.card.querySelector('#search-edit-id').value;
                const id = parseInt(idInput);
                if (id) this.startEdit(id);
                else alert("Vui lòng nhập ID hợp lệ.");
                return;
            }

            const navBtn = e.target.closest('.nav-btn:not(.disabled)');
            if (navBtn) {
                if (navBtn.id === 'prev-year') { const idx = this._availableYears.indexOf(this._selectedYear); this._selectedYear = this._availableYears[idx + 1]; this.updateData(); }
                else if (navBtn.id === 'next-year') { const idx = this._availableYears.indexOf(this._selectedYear); this._selectedYear = this._availableYears[idx - 1]; this.updateData(); }
                else if (navBtn.id === 'prev-month') { const mArr = ['all', ...this._availableMonths]; const cM = this._selectedMonth === 'all' ? 'all' : parseInt(this._selectedMonth); const idx = mArr.indexOf(cM); this._selectedMonth = mArr[idx - 1]; this.updateData(); }
                else if (navBtn.id === 'next-month') { const mArr = ['all', ...this._availableMonths]; const cM = this._selectedMonth === 'all' ? 'all' : parseInt(this._selectedMonth); const idx = mArr.indexOf(cM); this._selectedMonth = mArr[idx + 1]; this.updateData(); }
                return;
            }

            const pNav = e.target.closest('.profile-nav');
            if (pNav) {
                let idx = this._profileList.findIndex(p => p.id === this._currentProfileId);
                if (pNav.id === 'prev-profile' && idx > 0) { this._currentProfileId = this._profileList[idx - 1].id; this.updateData(); }
                else if (pNav.id === 'next-profile' && idx < this._profileList.length - 1) { this._currentProfileId = this._profileList[idx + 1].id; this.updateData(); }
                return;
            }

            if (e.target.closest('#btn-cancel-del')) { this.closeDeleteModal(); return; }
            if (e.target.closest('#btn-confirm-del')) { this.executeDelete(); return; }

            const toggleDetails = e.target.closest('#toggle-details');
            if (toggleDetails) {
                const detailsContent = this.card.querySelector('#details-content');
                if (detailsContent) {
                    if (detailsContent.style.display === 'none') {
                        detailsContent.style.display = 'block';
                        toggleDetails.innerHTML = `<span>Ẩn thông tin chi tiết</span> <ha-icon icon="mdi:chevron-up"></ha-icon>`;
                    } else {
                        detailsContent.style.display = 'none';
                        toggleDetails.innerHTML = `<span>Nhập thông tin chi tiết (Model, BH, VAT, Ghi chú...)</span> <ha-icon icon="mdi:chevron-down"></ha-icon>`;
                    }
                }
            }
        });

        this.card.addEventListener('change', (e) => {
            if (e.target.id === 'profile-select') { this._currentProfileId = e.target.value; this.updateData(); }
            else if (e.target.id === 'year-select') { this._selectedYear = parseInt(e.target.value); this.updateData(); }
            else if (e.target.id === 'month-select') { this._selectedMonth = e.target.value; this.updateData(); }
            else if (e.target.id === 'warranty-slider') {
                this._warrantyDays = parseInt(e.target.value);
                this._warrantyPage = 1;
                this.renderSearchDynamic();
            }
        });

        this.card.addEventListener('input', (e) => {
            if (e.target.id === 'search-input') {
                this._searchKeyword = e.target.value;
                this._searchPage = 1;
                
                const clearIcon = this.card.querySelector('#clear-search');
                if(this._searchKeyword && !clearIcon) {
                    const ic = document.createElement('ha-icon');
                    ic.icon = 'mdi:close-circle'; ic.id = 'clear-search'; ic.className = 'clear-icon';
                    e.target.parentElement.appendChild(ic);
                } else if (!this._searchKeyword && clearIcon) { clearIcon.remove(); }
                
                this.renderSearchDynamic();
            } 
            else if (e.target.id === 'warranty-slider') {
                const val = e.target.value;
                const wValText = this.card.querySelector('#warranty-days-text');
                if (wValText) wValText.textContent = val;
                const percent = (val / 365) * 100;
                e.target.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, rgba(255,255,255,0.1) ${percent}%, rgba(255,255,255,0.1) 100%)`;
            }
        });
        
        this.card.addEventListener('click', (e) => {
           if(e.target.closest('#clear-search')) {
               const inp = this.card.querySelector('#search-input');
               if(inp) { inp.value = ''; this._searchKeyword = ''; }
               e.target.remove();
               this._searchPage = 1;
               this.renderSearchDynamic();
           } 
        });

        this.card.addEventListener('submit', (e) => {
            if (e.target.id === 'add-order-form') { e.preventDefault(); this.handleAddSubmit(e.target); }
        });
    }

    startEdit(orderId) {
        const item = this._allProfileItems.find(i => i.id === orderId);
        if (!item) {
            alert("Không tìm thấy đơn hàng với ID này trong hồ sơ hiện tại!");
            return;
        }
        this._editingOrder = item;
        this.switchTab('add');
    }

    updateTheme() {
        if(!this.card) return;
        const conf = this._config || {};
        const bgType = conf.bg_type || 'gradient';
        const bgOpacity = conf.bg_opacity !== undefined ? conf.bg_opacity : 70;
        let stringForContrastCalc = ""; 
        const applyOpacityToGradientStr = (str, opacity) => str.replace(/#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/gi, (match) => hexToRgba(match, opacity));

        if (bgType === 'gradient') {
            const preset = conf.bg_gradient_preset || 'linear-gradient(135deg, #2b5876, #4e4376)';
            if (preset === 'custom') {
                const color1 = conf.bg_gradient_color1 || '#1e293b';
                const color2 = conf.bg_gradient_color2 || '#0f172a';
                const angle = conf.bg_gradient_angle !== undefined ? conf.bg_gradient_angle : 135;
                this.card.style.background = `linear-gradient(${angle}deg, ${hexToRgba(color1, bgOpacity)}, ${hexToRgba(color2, bgOpacity)})`;
                stringForContrastCalc = `${color1} ${color2}`;
            } else {
                this.card.style.background = applyOpacityToGradientStr(preset, bgOpacity);
                stringForContrastCalc = preset;
            }
        } else {
            const bgColor = conf.bg_color || '#1e293b';
            this.card.style.background = hexToRgba(bgColor, bgOpacity);
            stringForContrastCalc = bgColor;
        }

        const borderEnabled = conf.border_enable !== undefined ? conf.border_enable : false;
        if (borderEnabled) {
            const borderWidth = conf.border_width !== undefined ? conf.border_width : 1;
            const borderOpacity = conf.border_opacity !== undefined ? conf.border_opacity : 10;
            const borderColor = conf.border_color || '#ffffff';
            this.card.style.border = (borderOpacity > 0 && borderWidth > 0) ? `${borderWidth}px solid ${hexToRgba(borderColor, borderOpacity)}` : 'none';
        } else { this.card.style.border = 'none'; }

        const shadowEnabled = conf.shadow_enable !== undefined ? conf.shadow_enable : false;
        if (shadowEnabled) {
            const shadowColor = conf.shadow_color || '#000000';
            const shadowOpacity = conf.shadow_opacity !== undefined ? conf.shadow_opacity : 20;
            const blur = conf.shadow_blur !== undefined ? conf.shadow_blur : 32;
            const offsetX = conf.shadow_offset_x !== undefined ? conf.shadow_offset_x : 0;
            const offsetY = conf.shadow_offset_y !== undefined ? conf.shadow_offset_y : 8;
            this.card.style.boxShadow = `${offsetX}px ${offsetY}px ${blur}px ${hexToRgba(shadowColor, shadowOpacity)}`;
        } else { this.card.style.boxShadow = 'none'; }
        
        this.card.style.backdropFilter = "blur(16px)";
        this.card.style.webkitBackdropFilter = "blur(16px)";
        this.card.style.borderRadius = "var(--ha-card-border-radius, 16px)";
        this.card.style.padding = "clamp(12px, 3vw, 16px)";
        this.card.style.height = `${conf.card_height || 600}px`;
        this.card.style.display = 'flex';
        this.card.style.flexDirection = 'column';
        this.card.style.overflow = "hidden";
        this.card.style.isolation = 'isolate';

        let c_text = conf.textColor || '#f8fafc';
        let c_accent = conf.accentColor || '#0ea5e9';
        let c_money = conf.moneyColor || '#38bdf8';
        let c_block = conf.blockBg || 'rgba(255, 255, 255, 0.05)';
        let c_text_dim = '', c_option_bg = '';

        if (conf.auto_contrast !== false) { 
            const hexRegex = /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/gi;
            let match, colorsToCheck = [];
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

                const prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
                let isDarkTheme = (this._hass && this._hass.themes && this._hass.themes.darkMode !== undefined) ? this._hass.themes.darkMode : prefersDark;

                const op = bgOpacity / 100;
                const baseBg = isDarkTheme ? 30 : 245; 
                const effR = Math.round(avgR * op + baseBg * (1 - op));
                const effG = Math.round(avgG * op + baseBg * (1 - op));
                const effB = Math.round(avgB * op + baseBg * (1 - op));

                const yiq = ((effR * 299) + (effG * 587) + (effB * 114)) / 1000;
                const isLightBackground = yiq >= 135;

                let r = effR / 255, g = effG / 255, b = effB / 255;
                let max = Math.max(r, g, b), min = Math.min(r, g, b);
                let h, s, l = (max + min) / 2;
                if (max == min) { h = s = 0; }
                else {
                    let d = max - min;
                    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                    switch(max) {
                        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                        case g: h = (b - r) / d + 2; break;
                        case b: h = (r - g) / d + 4; break;
                    }
                    h /= 6;
                }
                let hue = Math.round(h * 360);

                if (isLightBackground) {
                    c_text = '#1a1a1a'; c_text_dim = 'rgba(0,0,0,0.6)';
                    c_block = `rgba(0, 0, 0, ${Math.max(0.04, op * 0.1)})`; c_option_bg = '#ffffff';
                    if (s < 0.15) { c_accent = '#0ea5e9'; c_money = '#ea580c'; }
                    else if (hue >= 330 || hue < 45) { c_accent = '#0891b2'; c_money = '#059669'; } 
                    else if (hue >= 45 && hue < 160) { c_accent = '#7c3aed'; c_money = '#dc2626'; } 
                    else if (hue >= 160 && hue < 260) { c_accent = '#ea580c'; c_money = '#be185d'; } 
                    else { c_accent = '#059669'; c_money = '#0284c7'; } 
                } else {
                    c_text = '#ffffff'; c_text_dim = 'rgba(255,255,255,0.6)';
                    c_block = `rgba(255, 255, 255, ${Math.max(0.05, op * 0.15)})`; c_option_bg = '#1e293b';
                    if (s < 0.15) { c_accent = '#38bdf8'; c_money = '#fbbf24'; }
                    else if (hue >= 330 || hue < 45) { c_accent = '#22d3ee'; c_money = '#34d399'; }
                    else if (hue >= 45 && hue < 160) { c_accent = '#a78bfa'; c_money = '#f43f5e'; }
                    else if (hue >= 160 && hue < 260) { c_accent = '#fb923c'; c_money = '#f472b6'; }
                    else { c_accent = '#4ade80'; c_money = '#38bdf8'; }
                }
            }
        } else {
            c_text_dim = hexToRgba(c_text, 60);
            c_option_bg = c_block;
        }

        this.card.style.setProperty('--text-main', c_text);
        this.card.style.setProperty('--text-dim', c_text_dim);
        this.card.style.setProperty('--accent', c_accent);
        this.card.style.setProperty('--money', c_money);
        this.card.style.setProperty('--block-bg', c_block);
        this.card.style.setProperty('--option-bg', c_option_bg);
        this.card.style.setProperty('--glass-border', hexToRgba(conf.border_color || '#ffffff', (conf.border_opacity || 10) / 2));
    }

    renderHeaderAndTabs() {
        if(!this._els) return;
        const conf = this._config || {};
        const title = conf.title || "Quản Lý Mua Sắm";
        const configIcon = conf.icon || "mdi:cart-outline";
        const iconHtml = configIcon.includes(":") ? `<ha-icon icon="${configIcon}"></ha-icon>` : `<span class="emoji-icon">${configIcon}</span>`;

        this._els.header.innerHTML = `${iconHtml} ${title}`;

        const pIdx = this._profileList.findIndex(p => p.id === this._currentProfileId);
        const prevOpacity = pIdx > 0 ? 0.8 : 0.2;
        const prevPointer = pIdx > 0 ? 'auto' : 'none';
        const nextOpacity = pIdx < this._profileList.length - 1 ? 0.8 : 0.2;
        const nextPointer = pIdx < this._profileList.length - 1 ? 'auto' : 'none';

        this._els.topbar.innerHTML = `
            <div class="profile-selector">
                <ha-icon class="profile-nav" icon="mdi:chevron-left" id="prev-profile" style="opacity: ${prevOpacity}; pointer-events: ${prevPointer}"></ha-icon>
                <div class="profile-info-wrapper">
                    <ha-icon icon="mdi:account-box-outline" style="color: var(--accent); font-size: 18px; flex-shrink: 0;"></ha-icon>
                    <select id="profile-select">
                        ${this._profileList.length > 0 
                            ? this._profileList.map(p => `<option value="${p.id}" ${this._currentProfileId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')
                            : `<option value="">Chưa có dữ liệu</option>`
                        }
                    </select>
                </div>
                <ha-icon class="profile-nav" icon="mdi:chevron-right" id="next-profile" style="opacity: ${nextOpacity}; pointer-events: ${nextPointer}"></ha-icon>
            </div>
            
            <div class="tab search-tab-btn ${this._activeTab === 'search' ? 'active' : ''}" data-target="search" title="Tra cứu & Bảo hành">
                <ha-icon icon="mdi:magnify" style="flex-shrink: 0;"></ha-icon>
                <span class="st-text">Tra cứu</span>
            </div>
        `;

        this._els.tabs.innerHTML = `
           <div class="tab ${this._activeTab === 'history' ? 'active' : ''}" data-target="history">📋 Lịch sử</div>
           <div class="tab ${this._activeTab === 'add' ? 'active' : ''}" data-target="add">➕ Thêm / Sửa</div>
        `;
    }

    switchTab(tabName) {
      if (tabName !== 'add') this._editingOrder = null;
      this._activeTab = tabName;
      this._expandedOrderId = null;
      this._historyPage = 1;
      this._searchPage = 1;
      this._warrantyPage = 1;
      this.renderHeaderAndTabs();
      this.renderContent();
    }

    renderContent() {
      if(!this._els) return;
      if (this._activeTab === 'history') {
          this._els.content.innerHTML = this.getHistoryHTML();
      } else if (this._activeTab === 'search') {
          this._els.content.innerHTML = this.getSearchHTML();
          const wSlider = this.card.querySelector('#warranty-slider');
          if(wSlider) {
              const percent = (wSlider.value / 365) * 100;
              wSlider.style.background = `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, rgba(255,255,255,0.1) ${percent}%, rgba(255,255,255,0.1) 100%)`;
          }
      } else if (this._activeTab === 'add') {
          this._els.content.innerHTML = this.getAddHTML();
      }
    }

    getHistoryHTML() {
        const yIdx = this._availableYears.indexOf(this._selectedYear);
        const yPrevDisabled = yIdx >= this._availableYears.length - 1 || this._availableYears.length === 0 ? 'disabled' : '';
        const yNextDisabled = yIdx <= 0 || this._availableYears.length === 0 ? 'disabled' : '';

        const mArr = ['all', ...this._availableMonths];
        const currentM = this._selectedMonth === 'all' ? 'all' : parseInt(this._selectedMonth);
        const mIdx = mArr.indexOf(currentM);
        const mPrevDisabled = mIdx <= 0 ? 'disabled' : '';
        const mNextDisabled = mIdx >= mArr.length - 1 ? 'disabled' : '';

        return `
          <div class="controls fade-in">
            <div class="control-box">
              <ha-icon class="nav-btn ${yPrevDisabled}" id="prev-year" icon="mdi:chevron-left"></ha-icon>
              <select id="year-select">
                ${this._availableYears.map(y => `<option value="${y}" ${this._selectedYear === y ? 'selected' : ''}>${y}</option>`).join('')}
                ${this._availableYears.length === 0 ? `<option value="">---</option>` : ''}
              </select>
              <ha-icon class="nav-btn ${yNextDisabled}" id="next-year" icon="mdi:chevron-right"></ha-icon>
            </div>
            <div class="control-box">
              <ha-icon class="nav-btn ${mPrevDisabled}" id="prev-month" icon="mdi:chevron-left"></ha-icon>
              <select id="month-select">
                <option value="all" ${this._selectedMonth === 'all' ? 'selected' : ''}>Cả năm</option>
                ${this._availableMonths.map(m => `<option value="${m}" ${this._selectedMonth == m ? 'selected' : ''}>Tháng ${m}</option>`).join('')}
              </select>
              <ha-icon class="nav-btn ${mNextDisabled}" id="next-month" icon="mdi:chevron-right"></ha-icon>
            </div>
          </div>
          <div style="font-size: clamp(13px, 3.5vw, 16px); font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px;" class="fade-in">
            <ha-icon icon="mdi:format-list-bulleted" style="font-size: clamp(16px, 4vw, 18px); color: var(--accent);"></ha-icon> 
            Chi tiết ${this._selectedMonth === 'all' ? `Năm ${this._selectedYear || '--'}` : `Tháng ${this._selectedMonth}/${this._selectedYear || '--'}`}
          </div>
          <div id="history-dynamic-area" class="fade-in" style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
            ${this.getHistoryDynamicHTML()}
          </div>
        `;
    }

    getHistoryDynamicHTML() {
        const startIdx = (this._historyPage - 1) * this._itemsPerPage;
        const currentHistoryItems = this._items.slice(startIdx, startIdx + this._itemsPerPage);

        return `
          <div class="table-container">
            <div class="t-header">
              <div>Ngày</div><div>Thông tin SP</div><div style="text-align: right; padding-right: 32px;">Thành tiền</div>
            </div>
            <div class="table-wrapper">
              ${this._items.length === 0 ? `
                <div class="empty-state-nice">
                  <ha-icon icon="mdi:cart-remove"></ha-icon>
                  <div class="empty-title">Chưa có dữ liệu</div>
                  <div class="empty-sub">Hồ sơ này chưa có đơn hàng nào trong thời gian bạn chọn.</div>
                  <button class="btn-primary" id="btn-empty-add"><ha-icon icon="mdi:plus"></ha-icon> Thêm đơn hàng ngay</button>
                </div>
              ` : this.renderTableRows(currentHistoryItems, false)}
            </div>
            ${this.renderPagination(this._historyPage, this._items.length, 'history')}
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
    }

    renderHistoryDynamic() {
        const dArea = this.card.querySelector('#history-dynamic-area');
        if(dArea) dArea.innerHTML = this.getHistoryDynamicHTML();
    }

    getSearchHTML() {
        return `
          <div class="search-tab-content fade-in">
              <div class="search-box">
                  <div class="s-input-group">
                      <ha-icon icon="mdi:magnify"></ha-icon>
                      <input type="text" id="search-input" value="${this._searchKeyword}" placeholder="Nhập tên SP, nơi mua, model...">
                      ${this._searchKeyword ? `<ha-icon icon="mdi:close-circle" id="clear-search" class="clear-icon"></ha-icon>` : ''}
                  </div>
              </div>

              <div class="warranty-box">
                  <div class="w-header">
                      <ha-icon icon="mdi:shield-alert-outline"></ha-icon> 
                      Sắp hết bảo hành (dưới <span class="w-hl" id="warranty-days-text">${this._warrantyDays}</span> ngày)
                  </div>
                  <div class="w-slider-container">
                      <input type="range" id="warranty-slider" min="0" max="365" value="${this._warrantyDays}" class="modern-slider">
                      <div class="w-ticks"><span>0</span><span>90</span><span>180</span><span>270</span><span>365</span></div>
                  </div>
              </div>
              
              <div id="search-dynamic-area" style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
                  ${this.getSearchDynamicHTML()}
              </div>
          </div>
        `;
    }

    getSearchDynamicHTML() {
        let keywordResults = [];
        if (this._searchKeyword.trim() !== '') {
            const kw = this._searchKeyword.toLowerCase().trim();
            keywordResults = this._allProfileItems.filter(item => 
                (item.ten_hang && item.ten_hang.toLowerCase().includes(kw)) ||
                (item.noi_mua && item.noi_mua.toLowerCase().includes(kw)) ||
                (item.model && item.model.toLowerCase().includes(kw)) ||
                (item.nganh_hang && item.nganh_hang.toLowerCase().includes(kw))
            );
        }

        let warrantyResults = [];
        this._allProfileItems.forEach(item => {
            const days = this.getDaysUntilExpiry(item.ngay_het_bh);
            if (days !== null && days >= 0 && days <= this._warrantyDays) {
                item._daysLeft = days; 
                warrantyResults.push(item);
            }
        });
        warrantyResults.sort((a, b) => a._daysLeft - b._daysLeft); 

        const startSearch = (this._searchPage - 1) * this._itemsPerPage;
        const currentSearchItems = keywordResults.slice(startSearch, startSearch + this._itemsPerPage);

        const startWarranty = (this._warrantyPage - 1) * this._itemsPerPage;
        const currentWarrantyItems = warrantyResults.slice(startWarranty, startWarranty + this._itemsPerPage);

        return `
            ${this._searchKeyword ? `
            <div class="table-container fade-in-fast" style="margin-bottom: 16px; flex: none;">
                <div class="t-header search-header">
                  <div>Ngày mua</div><div>Kết quả tìm kiếm (${keywordResults.length})</div><div style="text-align: right;">Thành tiền</div>
                </div>
                <div class="table-wrapper">
                    ${this.renderTableRows(currentSearchItems, true)}
                </div>
                ${this.renderPagination(this._searchPage, keywordResults.length, 'search')}
            </div>` : ''}

            <div class="table-container fade-in-fast" style="flex:1;">
                <div class="t-header warranty-header">
                  <div>Ngày mua</div><div>Đang trong hạn (${warrantyResults.length})</div><div style="text-align: right;">Thành tiền</div>
                </div>
                <div class="table-wrapper">
                    ${this.renderTableRows(currentWarrantyItems, true)}
                </div>
                ${this.renderPagination(this._warrantyPage, warrantyResults.length, 'warranty')}
            </div>
        `;
    }

    renderSearchDynamic() {
        const sArea = this.card.querySelector('#search-dynamic-area');
        if(sArea) sArea.innerHTML = this.getSearchDynamicHTML();
    }

    getAddHTML() {
        const catOptions = Array.from(this._uniqueCategories).sort().map(c => `<option value="${c}">`).join('');
        const placeOptions = Array.from(this._uniquePlaces).sort().map(p => `<option value="${p}">`).join('');
        const mfgOptions = Array.from(this._uniqueManufacturers).sort().map(m => `<option value="${m}">`).join('');
        const todayStr = new Date().toISOString().split('T')[0];
        
        const activeProfileName = (this._profilesData[this._currentProfileId] && this._profilesData[this._currentProfileId].name) ? this._profilesData[this._currentProfileId].name : 'Hồ sơ mặc định';
        
        const isEdit = !!this._editingOrder;
        const titleText = isEdit ? `Sửa đơn hàng ID: ${this._editingOrder.id}` : `Nhập vào: ${activeProfileName}`;
        const btnText = isEdit ? `Cập nhật Đơn Hàng` : `Lưu Đơn Hàng`;
        const iconSave = isEdit ? `mdi:content-save-edit-outline` : `mdi:content-save-outline`;
        const eOrder = this._editingOrder || {};

        const v_name = eOrder.ten_hang || '';
        const v_place = eOrder.noi_mua || '';
        const v_cat = eOrder.nganh_hang || '';
        const v_price = eOrder.don_gia || '';
        const v_qty = eOrder.so_luong || 1;
        const v_date = eOrder.ngay_mua || todayStr;
        const v_status = eOrder.tinh_trang || 'Mới';
        const v_model = eOrder.model || '';
        const v_mfg = eOrder.hang_sx || '';
        const v_vat = eOrder.vat_percent || 0;
        const v_war = eOrder.thoi_gian_bh_thang || 0;
        const v_note = eOrder.ghi_chu || '';

        const showDetails = isEdit ? 'block' : 'none';
        const detailIcon = isEdit ? 'mdi:chevron-up' : 'mdi:chevron-down';
        const detailText = isEdit ? 'Ẩn thông tin chi tiết' : 'Nhập thông tin chi tiết (Model, BH, VAT, Ghi chú...)';

        return `
          <div class="add-tab-wrapper fade-in">
          
          <div class="search-id-box" style="display:flex; gap:8px; margin-bottom: 16px;">
              <input type="number" id="search-edit-id" placeholder="Tìm ID đơn hàng để sửa nhanh..." style="flex:1; padding: 8px 12px; border-radius:8px; border:1px solid var(--glass-border); background:var(--block-bg); color:var(--text-main); outline:none;">
              <button type="button" id="btn-search-edit" class="btn-primary" style="padding: 8px 16px;"><ha-icon icon="mdi:magnify"></ha-icon> Tìm & Sửa</button>
          </div>

          <form id="add-order-form">
            <div class="form-title">
              <ha-icon icon="${isEdit ? 'mdi:pencil-box-multiple-outline' : 'mdi:cart-plus'}"></ha-icon> 
              ${titleText}
            </div>
            
            <datalist id="cat-list">${catOptions}</datalist>
            <datalist id="place-list">${placeOptions}</datalist>
            <datalist id="mfg-list">${mfgOptions}</datalist>
            
            <div class="form-row">
              <div class="f-group">
                <label>Tên hàng hóa <span style="color:var(--money)">*</span></label>
                <input type="text" id="f_name" required value="${v_name}" placeholder="VD: iPhone 15 Pro Max">
              </div>
            </div>

            <div class="form-row split">
              <div class="f-group">
                <label>Nơi mua <span style="color:var(--money)">*</span></label>
                <input type="text" id="f_place" required list="place-list" value="${v_place}" placeholder="VD: Shopee">
              </div>
              <div class="f-group">
                <label>Ngành hàng <span style="color:var(--money)">*</span></label>
                <input type="text" id="f_category" required list="cat-list" value="${v_cat}" placeholder="VD: Công nghệ">
              </div>
            </div>

            <div class="form-row split">
              <div class="f-group">
                <label>Đơn giá (VNĐ) <span style="color:var(--money)">*</span></label>
                <input type="number" id="f_price" required min="0" value="${v_price}" placeholder="0">
              </div>
              <div class="f-group" style="flex: 0.5;">
                <label>Số lượng <span style="color:var(--money)">*</span></label>
                <input type="number" id="f_qty" required min="0.1" step="0.1" value="${v_qty}">
              </div>
            </div>

            <div class="form-row split">
              <div class="f-group">
                <label>Ngày mua</label>
                <input type="date" id="f_date" value="${v_date}">
              </div>
              <div class="f-group">
                <label>Tình trạng <span style="color:var(--money)">*</span></label>
                <select id="f_status">
                  <option value="Mới" ${v_status === 'Mới' ? 'selected' : ''}>Mới</option>
                  <option value="Cũ / Like New" ${v_status === 'Cũ / Like New' ? 'selected' : ''}>Cũ / Like New</option>
                  <option value="Hàng trưng bày" ${v_status === 'Hàng trưng bày' ? 'selected' : ''}>Hàng trưng bày</option>
                  <option value="Hỏng / Xác" ${v_status === 'Hỏng / Xác' ? 'selected' : ''}>Hỏng / Xác</option>
                </select>
              </div>
            </div>

            <div class="form-details-toggle" id="toggle-details">
              <span>${detailText}</span> <ha-icon icon="${detailIcon}"></ha-icon>
            </div>

            <div class="form-details-content" id="details-content" style="display:${showDetails};">
              <div class="form-row split">
                <div class="f-group">
                  <label>Mã Model</label>
                  <input type="text" id="f_model" value="${v_model}" placeholder="Mã sản phẩm">
                </div>
                <div class="f-group">
                  <label>Hãng SX</label>
                  <input type="text" id="f_manufacturer" list="mfg-list" value="${v_mfg}" placeholder="Thương hiệu">
                </div>
              </div>
              <div class="form-row split">
                <div class="f-group">
                  <label>Thuế VAT (%)</label>
                  <input type="number" id="f_vat" min="0" max="100" value="${v_vat}">
                </div>
                <div class="f-group">
                  <label>Bảo hành (tháng)</label>
                  <input type="number" id="f_warranty" min="0" value="${v_war}">
                </div>
              </div>
              <div class="form-row">
                <div class="f-group">
                  <label>Ghi chú</label>
                  <textarea id="f_note" placeholder="Nhập ghi chú cho đơn hàng..." rows="2" style="width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.15); border: 1px solid var(--glass-border); color: var(--text-main); padding: 10px 12px; border-radius: 8px; font-size: 14px; outline: none; transition: 0.2s; font-family: inherit; resize: vertical;">${v_note}</textarea>
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 12px; margin-top: 16px;">
                ${isEdit ? `<button type="button" class="btn-primary" id="btn-cancel-edit" style="background: rgba(255,255,255,0.1); color: var(--text-main); flex: 0.4;"><ha-icon icon="mdi:close"></ha-icon> Hủy</button>` : ''}
                <button type="submit" class="btn-primary" style="flex: 1; font-size: 16px; padding: 12px;">
                  <ha-icon icon="${iconSave}"></ha-icon> ${btnText}
                </button>
            </div>
          </form>
          </div>
        `;
    }

    renderTableRows(itemsArray, isSearchMode = false) {
       if (itemsArray.length === 0) return `<div style="text-align:center; padding: 20px; color: var(--text-dim);">Không có đơn hàng nào.</div>`;
       
       return itemsArray.map(item => {
          const bhStatus = this.checkWarrantyStatus(item.ngay_het_bh);
          const isExpanded = this._expandedOrderId === item.id;
          
          let dateStr = isSearchMode ? formatDate(item.ngay_mua) : (formatDate(item.ngay_mua).split('/').length >= 2 ? `${formatDate(item.ngay_mua).split('/')[0]}/${formatDate(item.ngay_mua).split('/')[1]}` : formatDate(item.ngay_mua));

          return `
          <div class="t-row-container">
              <div class="t-row ${isExpanded ? 'expanded' : ''}" data-id="${item.id}">
                <div class="col-date" style="${isSearchMode ? 'font-size: 10px;' : ''}">
                  <div>${dateStr}</div>
                  <div class="d-id">ID: ${item.id}</div>
                </div>
                <div class="col-info">
                  <div class="info-name">${item.ten_hang}</div>
                  <div class="info-sub">
                      ${item.thoi_gian_bh_thang ? item.thoi_gian_bh_thang + ' tháng' : 'Không BH'} | 
                      <span class="warranty-date ${bhStatus.class}">${bhStatus.text}</span>
                  </div>
                </div>
                <div class="col-price">
                  <div class="price-val">${formatMoney(item.thanh_tien_sau_vat)}</div>
                  <div class="price-qty">SL: ${item.so_luong}</div>
                </div>
                ${!isSearchMode ? `
                <div class="col-action">
                  <ha-icon class="btn-edit" icon="mdi:pencil-outline" data-id="${item.id}" title="Sửa"></ha-icon>
                  <ha-icon class="btn-delete" icon="mdi:delete-outline" data-id="${item.id}" title="Xóa"></ha-icon>
                </div>` : ''}
              </div>
              
              <div class="row-details slide-down" style="display: ${isExpanded ? 'block' : 'none'};">
                 <div class="detail-grid">
                    <div class="d-item"><span class="d-lbl">Nơi mua:</span> <span class="d-val">${item.noi_mua || '--'}</span></div>
                    <div class="d-item"><span class="d-lbl">Ngành hàng:</span> <span class="d-val">${item.nganh_hang || '--'}</span></div>
                    <div class="d-item"><span class="d-lbl">Tình trạng:</span> <span class="d-val">${item.tinh_trang || 'Mới'}</span></div>
                    <div class="d-item"><span class="d-lbl">Hãng SX:</span> <span class="d-val">${item.hang_sx || '--'}</span></div>
                    <div class="d-item"><span class="d-lbl">Model:</span> <span class="d-val">${item.model || '--'}</span></div>
                    <div class="d-item"><span class="d-lbl">VAT:</span> <span class="d-val">${item.vat_percent || 0}%</span></div>
                    <div class="d-item" style="grid-column: 1 / -1; margin-top: 4px;"><span class="d-lbl">Ghi chú:</span> <span class="d-val" style="white-space: normal; line-height: 1.4;">${item.ghi_chu || '--'}</span></div>
                 </div>
              </div>
          </div>
        `}).join('');
    }

    renderPagination(currentPage, totalItems, type) {
        const totalPages = Math.ceil(totalItems / this._itemsPerPage);
        if (totalPages <= 1) return ''; 

        return `
          <div class="pagination-container">
            <ha-icon class="page-btn ${currentPage === 1 ? 'disabled' : ''}" data-type="${type}" data-page="1" icon="mdi:chevron-double-left"></ha-icon>
            <ha-icon class="page-btn ${currentPage === 1 ? 'disabled' : ''}" data-type="${type}" data-page="${currentPage - 1}" icon="mdi:chevron-left"></ha-icon>
            <div class="page-info">${currentPage} / ${totalPages}</div>
            <ha-icon class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" data-type="${type}" data-page="${currentPage + 1}" icon="mdi:chevron-right"></ha-icon>
            <ha-icon class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" data-type="${type}" data-page="${totalPages}" icon="mdi:chevron-double-right"></ha-icon>
          </div>
        `;
    }

    openDeleteModal(orderId) {
       this._itemToDelete = orderId;
       this._els.modal.innerHTML = `
        <div class="custom-modal-overlay fade-in-fast">
            <div class="custom-modal zoom-in">
                <ha-icon icon="mdi:alert-circle-outline" style="color: #ef4444; font-size: 54px; margin-bottom: 8px;"></ha-icon>
                <h3>Xác Nhận Xóa Đơn Hàng</h3>
                <p>Bạn có chắc chắn muốn xóa đơn hàng <strong>ID: ${this._itemToDelete}</strong> không?<br><span style="color: #ef4444; font-size: 0.9em; font-weight: bold; margin-top: 6px; display: inline-block;">Hành động này không thể hoàn tác!</span></p>
                <div class="modal-actions">
                    <button class="btn-modal-cancel" id="btn-cancel-del">Quay lại</button>
                    <button class="btn-modal-confirm" id="btn-confirm-del">Xóa</button>
                </div>
            </div>
        </div>
       `;
    }

    closeDeleteModal() {
       this._itemToDelete = null;
       this._els.modal.innerHTML = '';
    }

    async executeDelete() {
      const entryId = this._currentProfileId;
      if (!entryId) {
          alert("Không tìm thấy ID Hồ sơ!");
          this.closeDeleteModal();
          return;
      }
      
      const orderId = this._itemToDelete;
      
      try {
          await this._hass.callService('shopping_history', 'delete_order', { entry_id: entryId, order_id: orderId });
          this.closeDeleteModal();
      } catch(err) {
          alert("Lỗi khi xóa từ Home Assistant: " + err.message);
          this.closeDeleteModal();
      }
    }

    async handleAddSubmit(formEl) {
      const entryId = this._currentProfileId;
      if (!entryId) return alert("Hệ thống chưa tải xong kết nối hoặc chưa có Hồ sơ.\n\nVui lòng tải lại trang hoặc đợi một chút.");

      const data = {
          entry_id: entryId,
          name: formEl.querySelector('#f_name').value,
          place: formEl.querySelector('#f_place').value,
          category: formEl.querySelector('#f_category').value,
          price: parseFloat(formEl.querySelector('#f_price').value),
          quantity: parseFloat(formEl.querySelector('#f_qty').value) || 1,
          vat: parseFloat(formEl.querySelector('#f_vat').value) || 0,
          status: formEl.querySelector('#f_status').value,
          model: formEl.querySelector('#f_model').value || "",
          manufacturer: formEl.querySelector('#f_manufacturer').value || "",
          warranty_months: parseInt(formEl.querySelector('#f_warranty').value) || 0,
          note: formEl.querySelector('#f_note').value || "",
      };

      const pDate = formEl.querySelector('#f_date').value;
      if (pDate) data.purchase_date = pDate;

      const isEdit = !!this._editingOrder;
      const serviceName = isEdit ? 'edit_order' : 'add_order';
      if (isEdit) {
          data.order_id = this._editingOrder.id;
      }

      try {
          await this._hass.callService('shopping_history', serviceName, data);
          formEl.reset();
          this._editingOrder = null;
          this.switchTab('history');
      } catch(err) {
          alert("Lỗi khi lưu: " + err.message);
      }
    }
  }

  // TRÁNH LỖI OVERWRITE TỪ CACHE CỦA HA COMPANION APP BẰNG VIỆC CHECK TỒN TẠI
  if (!customElements.get('shopping-history-editor')) {
      customElements.define('shopping-history-editor', ShoppingHistoryEditor);
  }
  if (!customElements.get('shopping-history-card')) {
      customElements.define('shopping-history-card', ShoppingHistoryCard);
  }

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "shopping-history-card",
    name: "Lịch Sử Mua Sắm",
    description: "Thẻ hiển thị chi tiết lịch sử mua sắm đa cấu hình, kèm tính năng nhập, tìm kiếm và kiểm tra bảo hành.",
    preview: true,
  });
})();
