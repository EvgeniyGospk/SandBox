# UI/UX Design — Particula

## Общий стиль

- **Тема**: Dark mode (как IDE)
- **Цветовая схема**: Тёмно-серый фон, яркие акценты
- **Шрифт**: Inter / JetBrains Mono (для чисел)
- **Радиусы**: 8px для карточек, 4px для кнопок
- **Тени**: Мягкие, subtle

### Цветовая палитра

```
Background:     #0D0D0D (основной)
Surface:        #1A1A1A (панели)
Surface Hover:  #252525
Border:         #333333
Text Primary:   #FFFFFF
Text Secondary: #A0A0A0
Accent:         #3B82F6 (blue)
Success:        #22C55E
Warning:        #F59E0B
Danger:         #EF4444
```

---

## Layout (Desktop)

```
┌─────────────────────────────────────────────────────────────┐
│                      Top Toolbar                             │
│  [Circle][Square][Line] │ Size: ═══●══ │ [Eraser][Pipette]  │
├────────┬────────────────────────────────────────┬───────────┤
│        │                                        │           │
│  Left  │                                        │   Right   │
│ Panel  │              Canvas                    │   Panel   │
│        │            (WebGL)                     │           │
│Elements│                                        │ Settings  │
│        │                                        │           │
│ [Sand] │                                        │ Gravity   │
│ [Water]│                                        │  ↑ ═●═    │
│ [Fire] │                                        │ Temp: 20° │
│  ...   │                                        │           │
├────────┴────────────────────────────────────────┴───────────┤
│              Bottom Bar                                      │
│  [▶ Play] [Step] │ Speed: 1x ▼ │ [Reset] │ FPS: 60 │ 150K   │
└─────────────────────────────────────────────────────────────┘
```

### Размеры панелей

| Панель | Ширина | Поведение |
|--------|--------|-----------|
| Left Panel | 200px | Collapsible |
| Right Panel | 220px | Collapsible |
| Top Toolbar | 48px height | Fixed |
| Bottom Bar | 40px height | Fixed |

---

## Layout (Mobile)

```
┌─────────────────────────┐
│      Top Bar            │
│  [≡] Particula [⚙️]     │
├─────────────────────────┤
│                         │
│                         │
│        Canvas           │
│       (Touch)           │
│                         │
│                         │
├─────────────────────────┤
│  Elements (Scroll H)    │
│ [Sand][Water][Fire]...  │
├─────────────────────────┤
│ [▶][⏸][🔄] Size: ══●══ │
└─────────────────────────┘
```

---

## Компоненты

### Element Button

```
┌─────────────┐
│   ██████    │  ← Color preview (gradient)
│   ██████    │
│             │
│    Sand     │  ← Name
└─────────────┘
     56x72px
     
States:
- Default: border transparent
- Hover: border #444
- Selected: border accent, glow
- Disabled: opacity 0.5
```

### Brush Size Slider

```
    1px                      50px
     ├──────────●────────────┤
              24px
              
     [○]      [●]     [○]
    Small   Current  Large
```

### Play/Pause Button

```
┌─────────┐     ┌─────────┐
│    ▶    │ ←→  │   ❚❚    │
│  Play   │     │  Pause  │
└─────────┘     └─────────┘
   Active        Active
   State         State
```

### FPS Counter

```
┌─────────────────┐
│ FPS: 60  ●      │  ← Green dot = good
│ Particles: 150K │
└─────────────────┘

Dot colors:
- Green:  FPS ≥ 50
- Yellow: FPS 30-49  
- Red:    FPS < 30
```

---

## Взаимодействия

### Canvas Gestures

| Действие | Desktop | Mobile |
|----------|---------|--------|
| Рисовать | Left Click + Drag | Touch + Drag |
| Стирать | Right Click + Drag | Two-finger tap + Drag |
| Пипетка | Middle Click | Long press |
| Zoom | Scroll wheel | Pinch |
| Pan | Space + Drag | Two-finger drag |

### Keyboard Shortcuts (Desktop)

| Клавиша | Действие |
|---------|----------|
| Space | Play/Pause |
| R | Reset |
| [ / ] | Brush size ±5 |
| 1-9 | Quick select element |
| E | Eraser |
| P | Pipette |
| Ctrl+S | Save |
| Ctrl+Z | Undo |

---

## Анимации

| Элемент | Анимация | Duration |
|---------|----------|----------|
| Panel collapse | Slide + fade | 200ms |
| Element select | Scale bounce | 150ms |
| Button hover | Background fade | 100ms |
| Modal appear | Fade + scale | 200ms |
| Toast appear | Slide from bottom | 300ms |

## Эффекты рендеринга

### Glow (Fire, Lava, Electricity)

```glsl
// Bloom post-process
vec3 bloom = texture(uBloomTexture, uv).rgb;
color += bloom * uBloomIntensity;
```

### Blur (Gases)

```glsl
// Gaussian blur для газов
vec3 blurred = gaussianBlur(uTexture, uv, uBlurRadius);
```

---

## Responsive Breakpoints

| Breakpoint | Width | Layout |
|------------|-------|--------|
| Desktop | ≥1024px | Full layout |
| Tablet | 768-1023px | Collapsed panels |
| Mobile | <768px | Bottom sheet UI |
