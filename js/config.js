"use strict";
/* ============================================================================
   THE LAST FIVE NIGHTS - config.js
   All tunable constants live here: speeds, distances, timers, difficulty tables.
   NOTE: nothing in this file touches the PlayCanvas global `pc` (it may not be
   loaded yet when this script runs).
   Created by MD Developer
   ============================================================================ */
const CFG = {
  VERSION: "v1.0",

  /* playable rectangle in metres (ground is larger, a tree ring marks the border) */
  BOUNDS: { minX: -66, maxX: 92, minZ: -82, maxZ: 66 },

  /* global night look (raise ambient if the game is too dark on your device) */
  LOOK: { ambient: [0.42, 0.5, 0.68], moon: 2.6, fogColor: [0.085, 0.15, 0.22], fogNear: 5, exposure: 1.15 },

  PLAYER: {
    radius: 0.4,
    eye: 1.65,
    crouchEye: 1.05,
    walk: 3.2,
    run: 5.8,
    crouch: 1.5,
    staminaSeconds: 8,        // seconds of running from full stamina
    staminaRegenSeconds: 5,   // seconds to refill from empty
    staminaResume: 0.25,      // after exhaustion, stamina needed before running again
    stepWalk: 0.5,            // metres per footstep (walk)
    stepRun: 0.35,            // metres per footstep (run)
    stepCrouch: 0.8,
    headBob: true,            // set false to disable head bob
    bobAmount: 0.035,
    towerSpeed: 0.5,          // speed multiplier on the watchtower platform
    beaconSpeed: 0.9,         // speed multiplier while carrying the beacon
    hideSpeedBreak: 1.8,      // moving faster than this breaks hiding
    invulnSeconds: 3,
    maxCarry: 6
  },

  FLASH: { range: 24, outer: 36, inner: 16, intensity: 2.8, spareBoostPct: 60, lowPct: 15 },

  /* loudness values used by Game.emitNoise(). Hearing radius = loudness * multiplier */
  NOISE: {
    walk: 4, run: 14, crouch: 1.5, doorOpen: 10, doorClose: 8, locker: 8, pickup: 2,
    generatorStart: 40, generatorLoop: 12, winch: 30, vehicle: 35, workLight: 18,
    flashlight: 3, metalDrop: 16, radioTune: 6, wireCut: 10, gatePower: 12,
    beaconPulse: 20, water: 6, ladder: 5, keypad: 3, gate: 6
  },

  HOLLOW: {
    radius: 0.55,
    roamSpeed: 2.2,
    trackSpeed: 3.0,
    searchSpeed: 2.4,
    visionAngle: 70,          // total cone in degrees
    peripheral: 4,            // metres: it notices you inside this range regardless of the cone
    noticeTime: 0.35,         // seconds in view before it starts pursuing
    catchDist: 1.0,
    alertTime: 1.2,
    searchMin: 10, searchMax: 15, searchRadius: 6,
    searchBonusPerAggr: 5,    // +1 s per 0.2 aggression
    hearWeather: [1.0, 0.7, 0.45],     // none, light rain, heavy rain
    sightWeather: [1.0, 0.9, 0.7],
    memoryWeather: [6, 5, 3.5],         // seconds it remembers the last known position
    streamSearch: 8,
    towerWait: 15,
    attractorLoud: 25,
    attractorSeconds: 25,
    flashSightMul: 30 / 22,
    hiddenSightMul: 12 / 22,
    insideSightMul: 8 / 22,
    workLightRadius: 15,
    hideFoolChance: 0.85,
    vanishMin: 20, vanishMax: 45,
    respawnMinDist: 40,
    clueRange: 40,
    giveUpDist: 26,           // it stops chasing when you are this far away (metres) ...
    giveUpTime: 2.5,          // ... for this many seconds
    giveUpMax: 28,            // a chase that never gets close gives up after this many seconds
    lungeDist: 7,             // inside this range it speeds up a little (the scary last stretch)
    speedPerTenth: 0.03,      // +3% speed per 0.1 aggression
    speedCap: 1.1,            // max +20%
    aggrPerObjective: 0.12,
    heartbeatRange: 15,
    catchRespawnDist: 50
  },

  WEATHER: { cycleMin: 60, cycleMax: 120, rainTarget: [0, 0.45, 1.0], fogMul: [1.0, 0.85, 0.6], windGust: 0.8 },

  DIFF: {
    easy:   { key: "easy",   label: "EASY",   hear: 0.8, sight: 18, chase: 3.9, flashSeconds: 360, attempts: null, detector: 22, beaconTime: 60 },
    normal: { key: "normal", label: "NORMAL", hear: 1.0, sight: 22, chase: 4.4, flashSeconds: 240, attempts: null, detector: 28, beaconTime: 90 },
    hard:   { key: "hard",   label: "HARD",   hear: 1.2, sight: 26, chase: 4.9, flashSeconds: 180, attempts: 3,    detector: 32, beaconTime: 120 }
  },

  QUALITY: {
    LOW:    { scale: 0.6, trees: 200, shadows: false, fogFar: 40, rain: 50,  treeDist: 45, lamps: 2 },
    MEDIUM: { scale: 0.8, trees: 320, shadows: false, fogFar: 50, rain: 100, treeDist: 60, lamps: 3 },
    HIGH:   { scale: 1.0, trees: 440, shadows: true,  fogFar: 60, rain: 160, treeDist: 70, lamps: 3 }
  },

  TREES: { seed: 1337, bushes: 46 },
  SENS: { min: 0.06, max: 0.40 },        // degrees of rotation per pixel

  /* values randomised per new game */
  FREQUENCIES: [88.7, 91.4, 97.3]
};
