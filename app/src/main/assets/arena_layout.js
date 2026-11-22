(() => {
  'use strict';

  const clockwiseCorners = { '1': '2', '2': '4', '3': '1', '4': '3' };
  const counterclockwiseCorners = { '1': '3', '2': '1', '3': '4', '4': '2' };
  const angleFields = ['hullAngle', 'turretAngle', 'moveAngle', 'aiMoveAngle', 'sniperLockAngle', 'angle', 'rot'];
  // Landscape-only lanes inserted inside each side wall of the rotated portrait arena.
  const FLANK_COLS = 2;
  const CORE_COLS = 22;
  // Left-flank pillar rows; the right flank mirrors them through the arena centre.
  const flankPillarPatterns = [[3, 10], [4, 9], [2, 6, 11], [3, 7, 10]];

  function assertRectangularGrid(grid) {
    const cols = grid.length > 0 && typeof grid[0] === 'string' ? grid[0].length : 0;
    if (!cols || grid.some((row) => typeof row !== 'string' || row.length !== cols)) {
      throw new Error('Arena grid must be a non-empty rectangle');
    }
    return cols;
  }

  function hashGrid(grid) {
    let hash = 2166136261;
    for (const row of grid) {
      for (let i = 0; i < row.length; i++) {
        hash ^= row.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    }
    return hash >>> 0;
  }

  function landscapeColumns(width, height) {
    if (![width, height].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error('Viewport dimensions must be positive');
    }
    // Round up to keep the entire perimeter visible while filling the horizontal viewport.
    return Math.max(CORE_COLS + FLANK_COLS * 2, Math.ceil(14 * width / height));
  }

  function flankColumns(cols, coreCols = CORE_COLS) {
    if (!Number.isSafeInteger(cols) || cols < coreCols + FLANK_COLS * 2) {
      throw new Error('Landscape arena must include both flank lanes');
    }
    const extra = cols - coreCols;
    return { left: Math.floor(extra / 2), right: Math.ceil(extra / 2) };
  }

  // Flank content depends only on the core grid and width, so every peer derives identical walls.
  function widenGrid(grid, cols = CORE_COLS + FLANK_COLS * 2) {
    const flanks = flankColumns(cols, assertRectangularGrid(grid));
    const rows = grid.length;
    const pillars = flankPillarPatterns[hashGrid(grid) % flankPillarPatterns.length];
    return grid.map((row, r) => {
      const edge = r === 0 || r === rows - 1;
      const left = edge ? '#'.repeat(flanks.left) : (pillars.includes(r) ? '#' : '.') + '.'.repeat(flanks.left - 1);
      const right = edge ? '#'.repeat(flanks.right) : '.'.repeat(flanks.right - 1) + (pillars.includes(rows - 1 - r) ? '#' : '.');
      return row[0] + left + row.slice(1, -1) + right + row[row.length - 1];
    });
  }

  function narrowGrid(grid) {
    const { left, right } = flankColumns(assertRectangularGrid(grid));
    return grid.map((row) => row[0] + row.slice(1 + left, -1 - right) + row[row.length - 1]);
  }

  function widenX(x, narrowWidth, tile, wideWidth = narrowWidth + FLANK_COLS * 2 * tile) {
    const { left, right } = flankColumns(wideWidth / tile, narrowWidth / tile);
    if (x < tile) return x;
    return x + tile * (x >= narrowWidth - tile ? left + right : left);
  }

  // Points inside a flank lane collapse onto the nearest core edge.
  function narrowX(x, wideWidth, tile) {
    const { left, right } = flankColumns(wideWidth / tile);
    const narrowWidth = wideWidth - (left + right) * tile;
    if (x < tile) return x;
    if (x >= wideWidth - tile) return x - (left + right) * tile;
    return Math.min(Math.max(x - left * tile, tile), narrowWidth - tile);
  }

  function mapEntityX(entity, mapX) {
    entity.x = mapX(entity.x);
    if (typeof entity.spawnX === 'number') entity.spawnX = mapX(entity.spawnX);
    if (Array.isArray(entity.trail)) {
      for (const point of entity.trail) point.x = mapX(point.x);
    }
  }

  function rotatePoint(point, width, height, clockwise) {
    const { x, y } = point;
    point.x = clockwise ? height - y : y;
    point.y = clockwise ? x : width - x;
  }

  function rotateVector(vector, clockwise) {
    const { x, y } = vector;
    vector.x = clockwise ? -y : y;
    vector.y = clockwise ? x : -x;
  }

  function rotateAngle(angle, clockwise) {
    const result = angle + (clockwise ? Math.PI / 2 : -Math.PI / 2);
    return Math.atan2(Math.sin(result), Math.cos(result));
  }

  function rotateCorner(kind, clockwise) {
    return (clockwise ? clockwiseCorners : counterclockwiseCorners)[kind] || kind;
  }

  function rotateGrid(grid, clockwise) {
    const rows = grid.length;
    const cols = assertRectangularGrid(grid);
    const rotated = Array.from({ length: cols }, () => new Array(rows));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nr = clockwise ? c : cols - 1 - c;
        const nc = clockwise ? rows - 1 - r : r;
        rotated[nr][nc] = rotateCorner(grid[r][c], clockwise);
      }
    }
    return rotated.map((row) => row.join(''));
  }

  function toLandscapeGrid(portraitGrid, cols) {
    return widenGrid(rotateGrid(portraitGrid, true), cols);
  }

  function toPortraitGrid(landscapeGrid) {
    return rotateGrid(narrowGrid(landscapeGrid), false);
  }

  // Rigid quarter-turns preserve collision distances, square tiles, and shell speeds.
  function rotateEntity(entity, width, height, clockwise) {
    if (typeof entity.w === 'number' && typeof entity.h === 'number') {
      const { x, y, w, h } = entity;
      entity.x = clockwise ? height - y - h : y;
      entity.y = clockwise ? x : width - x - w;
      entity.w = h;
      entity.h = w;
    } else {
      rotatePoint(entity, width, height, clockwise);
    }
    if (typeof entity.vx === 'number' && typeof entity.vy === 'number') {
      const velocity = { x: entity.vx, y: entity.vy };
      rotateVector(velocity, clockwise);
      entity.vx = velocity.x;
      entity.vy = velocity.y;
    }
    if (typeof entity.spawnX === 'number' && typeof entity.spawnY === 'number') {
      const spawn = { x: entity.spawnX, y: entity.spawnY };
      rotatePoint(spawn, width, height, clockwise);
      entity.spawnX = spawn.x;
      entity.spawnY = spawn.y;
    }
    for (const field of angleFields) {
      if (typeof entity[field] === 'number') {
        entity[field] = rotateAngle(entity[field], clockwise);
      }
    }
    if (Array.isArray(entity.trail)) {
      for (const point of entity.trail) rotatePoint(point, width, height, clockwise);
    }
  }

  function fitCanvas(width, height, availableWidth, availableHeight, dpr, cover = false) {
    if (![width, height, availableWidth, availableHeight, dpr].every((value) => Number.isFinite(value) && value > 0)) {
      throw new Error('Canvas dimensions and pixel ratio must be positive');
    }
    const scale = (cover ? Math.max : Math.min)(availableWidth / width, availableHeight / height);
    const displayWidth = availableWidth;
    const displayHeight = availableHeight;
    return {
      scale,
      displayWidth,
      displayHeight,
      pixelWidth: Math.max(1, Math.round(displayWidth * dpr)),
      pixelHeight: Math.max(1, Math.round(displayHeight * dpr)),
      offsetX: (displayWidth - width * scale) / 2,
      offsetY: (displayHeight - height * scale) / 2,
    };
  }

  window.RicochetArena = {
    FLANK_COLS, landscapeColumns, flankColumns, rotatePoint, rotateVector, rotateAngle, rotateCorner, rotateGrid, rotateEntity, fitCanvas,
    widenGrid, narrowGrid, toLandscapeGrid, toPortraitGrid, widenX, narrowX, mapEntityX,
  };
})();
