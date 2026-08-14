// FIFO engine untuk posisi dagang negara — port dari Python (backend/fifo.py).
export interface Trade {
  _id: string;
  itemCode: string;
  side: 'buy' | 'sell';
  quantity: number;
  unitPrice: number;
  time: number;
  counterpartyName: string;
}

export interface Position {
  itemCode: string;
  quantity: number;
  avgCost: number;
  totalCost: number;
}

export interface Flip {
  itemCode: string;
  buyQty: number;
  sellQty: number;
  buyUnitPrice: number;
  sellUnitPrice: number;
  buyTime: number;
  sellTime: number;
  profit: number;
  holdingMs: number;
}

export interface FifoResult {
  positions: Position[];
  flips: Flip[];
  totalCostBasis: number;
  realizedProfit: number;
  realizedQtySold: number;
}

interface Lot {
  quantity: number;
  unitPrice: number;
  time: number;
}

/**
 * Hitung posisi terbuka + flip FIFO dari daftar trade per item.
 * Urutkan per waktu: buy masuk lot (deque), sell mencocokkan lot tertua,
 * mencatat satu Flip per lot yang tercocokkan. Sisa lot = open position.
 * Sell yang tidak punya lot beli diabaikan (inventaris sebelum pelacakan).
 */
export function computeFifo(trades: Trade[]): FifoResult {
  const byItem = new Map<string, Trade[]>();
  for (const t of trades) {
    const key = t.itemCode.toLowerCase();
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key)!.push(t);
  }

  const positions: Position[] = [];
  const flips: Flip[] = [];
  let totalCostBasis = 0;
  let realizedProfit = 0;
  let realizedQtySold = 0;

  for (const [itemCode, itemTrades] of byItem) {
    const sorted = [...itemTrades].sort((a, b) => a.time - b.time);
    const lots: Lot[] = []; // deque di JS: shift() = lot tertua

    for (const trade of sorted) {
      if (trade.side === 'buy') {
        lots.push({ quantity: trade.quantity, unitPrice: trade.unitPrice, time: trade.time });
      } else if (trade.side === 'sell') {
        let remaining = trade.quantity;
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[0];
          const matchedQty = Math.min(remaining, lot.quantity);

          flips.push({
            itemCode,
            buyQty: matchedQty,
            sellQty: matchedQty,
            buyUnitPrice: lot.unitPrice,
            sellUnitPrice: trade.unitPrice,
            buyTime: lot.time,
            sellTime: trade.time,
            profit: (trade.unitPrice - lot.unitPrice) * matchedQty,
            holdingMs: trade.time - lot.time,
          });

          lot.quantity -= matchedQty;
          remaining -= matchedQty;
          realizedQtySold += matchedQty;
          realizedProfit += (trade.unitPrice - lot.unitPrice) * matchedQty;

          if (lot.quantity <= 0) lots.shift();
        }
      }
    }

    // Sisa lot menjadi open position
    if (lots.length > 0) {
      const totalQty = lots.reduce((sum, l) => sum + l.quantity, 0);
      const totalCost = lots.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
      positions.push({
        itemCode,
        quantity: totalQty,
        avgCost: totalQty > 0 ? totalCost / totalQty : 0,
        totalCost,
      });
      totalCostBasis += totalCost;
    }
  }

  return {
    positions,
    flips,
    totalCostBasis,
    realizedProfit,
    realizedQtySold,
  };
}
