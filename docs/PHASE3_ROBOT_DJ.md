# 🦞 Phase 3: Physical Claw DJ — Hardware Plan

## Concept
A lobster-themed robotic DJ that autonomously mixes music at parties.
The ClawDJ software engine runs the brain; physical actuators control real DJ equipment.

## Architecture

```
┌─────────────────────────────────────────────┐
│              ClawDJ Software                 │
│  (stem separation, BPM analysis, mixing)     │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │ Analyzer  │  │  Mixer   │  │ Discovery │ │
│  └─────┬────┘  └────┬─────┘  └─────┬─────┘ │
│        └─────────────┼──────────────┘        │
│                      │                        │
│              ┌───────▼───────┐               │
│              │  DJ Controller │               │
│              │   (new layer)  │               │
│              └───────┬───────┘               │
└──────────────────────┼───────────────────────┘
                       │ Serial/GPIO
              ┌────────▼────────┐
              │  Raspberry Pi 5  │
              │  + Motor HAT     │
              └────────┬────────┘
                       │ PWM/Servo signals
         ┌─────────────┼─────────────┐
         │             │             │
    ┌────▼───┐   ┌────▼───┐   ┌────▼───┐
    │Crossfader│  │  EQ    │  │ Platter │
    │ Servo   │  │ Servos │  │ Motor   │
    └────────┘   └────────┘   └────────┘
```

## Hardware Components

### Controller
| Component | Model | Est. Cost |
|-----------|-------|-----------|
| Main computer | Raspberry Pi 5 (8GB) | $80 |
| Motor controller | Adafruit Motor HAT v2 | $23 |
| Power supply | 5V 5A USB-C + 12V for motors | $25 |
| MicroSD | 128GB A2 | $15 |

### Actuators
| Component | Model | Est. Cost |
|-----------|-------|-----------|
| Crossfader servo | MG996R high-torque (x1) | $12 |
| EQ knob servos | SG90 micro servos (x3) | $9 |
| Platter motor | NEMA 17 stepper + driver | $25 |
| Claw gripper | SG90 micro servo (x2) | $6 |
| LED strip | WS2812B 1m (60 LEDs) | $10 |

### DJ Equipment
| Component | Model | Est. Cost |
|-----------|-------|-----------|
| DJ controller | Pioneer DDJ-200 or similar | $150 |
| Speakers | Powered monitor (any) | $100 |
| Audio interface | USB sound card | $20 |

### Enclosure
| Component | Description | Est. Cost |
|-----------|-------------|-----------|
| Shell | 3D printed lobster body | $50 (filament) |
| Frame | Aluminum extrusion 2020 | $30 |
| Mounting | 3D printed brackets | $10 |

### Sensors
| Component | Model | Est. Cost |
|-----------|-------|-----------|
| Crowd mic | USB condenser mic | $20 |
| Distance sensor | HC-SR04 ultrasonic (x2) | $4 |
| Camera (optional) | Pi Camera v3 | $25 |

## Total Estimated BOM: ~$614

## Software Integration

### New Module: `backend/services/robot_controller.py`
```python
# Controls physical DJ hardware via GPIO/Serial
class RobotDJ:
    def move_crossfader(self, position: float)  # 0.0 = left, 1.0 = right
    def set_eq(self, channel: str, value: float)  # bass/mid/treble, 0-1
    def scratch_platter(self, direction: str, speed: float)
    def set_leds(self, pattern: str, color: tuple)
    def read_crowd_energy(self) -> float  # mic input → energy level
```

### Party Mode Algorithm
1. Start with user-selected genre/vibe
2. Auto-discover and download tracks (discovery.py)
3. Analyze all tracks for BPM/key compatibility
4. Build optimal playlist (Camelot wheel + energy arc)
5. For each transition:
   - Separate stems of next track
   - Time-stretch to match current BPM
   - Gradually move crossfader (servo)
   - Adjust EQ during transition (servos)
   - Trigger LED pattern change
6. Monitor crowd energy via mic
   - High energy → maintain or increase tempo
   - Low energy → switch genre or drop a banger
7. Loop until party ends

### Crowd Energy Detection
```
Mic Input → FFT → Energy bands → Rolling average → Crowd score (0-1)
- Score > 0.7: crowd is hype, keep it going
- Score 0.4-0.7: steady, maybe build energy
- Score < 0.4: losing them, time for a hit
```

## Development Phases

### 3a: Software Controller (no hardware)
- Build robot_controller.py with mock/simulation mode
- Test mixing logic with virtual crossfader
- LED visualization on screen

### 3b: Prototype Build
- Raspberry Pi + servos on breadboard
- Mount on a DJ controller
- Test basic crossfader + EQ movement

### 3c: Lobster Shell
- Design enclosure in CAD (Fusion 360)
- 3D print lobster body
- Integrate all components
- Add LED eyes that react to music

### 3d: Party Mode
- Implement crowd energy detection
- Autonomous set generation
- Full party-length testing (2+ hours)

## References
- Adafruit Motor HAT: https://learn.adafruit.com/adafruit-dc-and-stepper-motor-hat-for-raspberry-pi
- WS2812B control: https://github.com/jgarff/rpi_ws281x
- Demucs on Pi: CPU-only, ~5-8min per track (pre-process the set)
- Pioneer DDJ MIDI mapping: can bypass physical servos with MIDI commands
