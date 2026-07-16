import { useState } from 'react';
import { Play, Shield, Terminal, ArrowRight, CheckCircle2, AlertTriangle, RefreshCw, Layers } from 'lucide-react';

interface EndpointPreset {
  name: string;
  path: string;
  description: string;
  category: 'Global' | 'Market' | 'Player' | 'Game';
  placeholderInput?: string;
}

const PRESETS: EndpointPreset[] = [
  {
    name: 'Global Server Stats',
    path: '/trpc/global.getStats?batch=1',
    description: 'Fetch current global server metrics, online players, and aggregate stats.',
    category: 'Global',
  },
  {
    name: 'Leaderboard Rankings',
    path: '/trpc/leaderboard.getTopPlayers?batch=1&input={"limit":10}',
    description: 'Retrieve top players based on power, level, or completed operations.',
    category: 'Global',
  },
  {
    name: 'Active Market Offers',
    path: '/trpc/market.getOffers?batch=1&input={"limit":10,"page":1}',
    description: 'Fetch current trade offers, prices, and resource listings on the marketplace.',
    category: 'Market',
  },
  {
    name: 'Recent Market Trades',
    path: '/trpc/market.getTradeHistory?batch=1&input={"limit":5}',
    description: 'See the most recently completed transactions and pricing of materials.',
    category: 'Market',
  },
  {
    name: 'Game Configuration',
    path: '/trpc/game.getConfig?batch=1',
    description: 'Get official recipe data, item points, energy multipliers, and base parameters.',
    category: 'Game',
  },
  {
    name: 'Player Profile Search',
    path: '/trpc/user.getProfile?batch=1&input={"address":"0x498a5e378E56B4D86D8B6c85848C079DeD1Db0C6"}',
    description: 'Look up standard player resources, company counts, and active worker counts.',
    category: 'Player',
  },
];

export default function ApiConsole() {
  const [selectedPreset, setSelectedPreset] = useState<EndpointPreset>(PRESETS[0]);
  const [customPath, setCustomPath] = useState(PRESETS[0].path);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [responseData, setResponseData] = useState<any>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSelectPreset = (preset: EndpointPreset) => {
    setSelectedPreset(preset);
    setCustomPath(preset.path);
  };

  const handleRunRequest = async () => {
    setIsLoading(true);
    setErrorText(null);
    setResponseData(null);
    setResponseStatus(null);

    // Call through our server-side proxy
    const proxyUrl = `/api/warera${customPath}`;

    try {
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });

      setResponseStatus(response.status);
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = await response.json();
        setResponseData(data);
      } else {
        const text = await response.text();
        try {
          // Attempt to parse anyway
          setResponseData(JSON.parse(text));
        } catch {
          setResponseData({ rawResponse: text });
        }
      }
    } catch (err: any) {
      console.error('Request failed:', err);
      setErrorText(err.message || 'Unknown network error. Is the development server running?');
      setResponseStatus(500);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-[#0F1117] border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-5" id="api-console-panel">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-400 animate-pulse" />
            <h2 className="text-lg font-semibold tracking-tight text-white">WarEra Real-Time tRPC API Console</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Test real-time game state queries via our custom backend secure reverse proxy.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-400 font-mono">
          <Shield className="w-3.5 h-3.5 text-emerald-500" />
          <span>CORS_BYPASS_PROXY: ACTIVE</span>
        </div>
      </div>

      {/* Split layout: Selector and input */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Column: Preset List (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Select Preset Endpoint Query</span>
          <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
            {PRESETS.map((p) => {
              const isSelected = selectedPreset.name === p.name;
              return (
                <button
                  key={p.name}
                  onClick={() => handleSelectPreset(p)}
                  className={`text-left p-3 rounded-lg border transition cursor-pointer flex flex-col gap-1 ${
                    isSelected
                      ? 'bg-indigo-950/20 border-indigo-500/50 text-slate-200'
                      : 'bg-[#0A0C10]/80 border-slate-800/80 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{p.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 uppercase font-mono tracking-wider">
                      {p.category}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal line-clamp-2">
                    {p.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: URL customizer and executor (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Configure Request Endpoint</span>
            
            <div className="flex flex-col gap-2">
              {/* URL builder */}
              <div className="flex items-stretch bg-[#0A0C10] border border-slate-800 rounded-lg overflow-hidden font-mono text-xs">
                <div className="bg-slate-900 px-3 flex items-center text-slate-500 border-r border-slate-800 select-none">
                  GET
                </div>
                <div className="bg-slate-950 px-3 flex items-center text-slate-400 select-none">
                  /api/warera
                </div>
                <input
                  type="text"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  className="flex-1 bg-transparent px-3 py-2 text-slate-200 focus:outline-none placeholder-slate-700"
                  placeholder="/trpc/endpoint.path?batch=1"
                />
              </div>
              <p className="text-[10px] text-slate-500 font-mono">
                💡 tRPC endpoints on <span className="text-slate-400">api2.warera.io</span> are queried via GET. Custom payload variables are passed inside the <span className="text-indigo-400">input=&#123;"key":"value"&#125;</span> query parameter.
              </p>
            </div>
          </div>

          {/* Action trigger button */}
          <button
            onClick={handleRunRequest}
            disabled={isLoading}
            className={`w-full py-2.5 rounded-lg font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
              isLoading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md'
            }`}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Executing tRPC Get Query...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Test Request
              </>
            )}
          </button>
        </div>
      </div>

      {/* Response Display Box */}
      <div className="flex flex-col gap-2 mt-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Response Console Output</span>
          {responseStatus !== null && (
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-slate-500">STATUS:</span>
              <span className={`font-bold flex items-center gap-1 ${
                responseStatus >= 200 && responseStatus < 300 
                  ? 'text-emerald-400' 
                  : 'text-red-400'
              }`}>
                {responseStatus >= 200 && responseStatus < 300 ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertTriangle className="w-3.5 h-3.5" />
                )}
                {responseStatus} {responseStatus === 200 ? 'OK' : 'Error'}
              </span>
            </div>
          )}
        </div>

        <div className="relative bg-[#0A0C10] border border-slate-800 rounded-lg p-4 h-[250px] overflow-hidden flex flex-col font-mono text-xs text-slate-300">
          {isLoading ? (
            <div className="absolute inset-0 bg-[#0A0C10]/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
              <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
              <span className="text-[11px] text-slate-500 tracking-wider">FETCHING LIVE DATA...</span>
            </div>
          ) : null}

          {errorText ? (
            <div className="flex flex-col gap-2 text-red-400 max-h-full overflow-y-auto">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>Execution Failed</span>
              </div>
              <p className="text-xs leading-relaxed bg-red-950/20 border border-red-900/40 p-2.5 rounded-md">
                {errorText}
              </p>
              <p className="text-[10px] text-slate-500">
                Check that your backend development server is running and your internet connection to api2.warera.io is stable.
              </p>
            </div>
          ) : responseData ? (
            <div className="flex-1 overflow-y-auto pr-1">
              <pre className="text-[11px] text-emerald-400/90 whitespace-pre-wrap leading-relaxed select-text font-mono">
                {JSON.stringify(responseData, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-2 select-none text-center px-4">
              <Layers className="w-8 h-8 text-slate-800" />
              <div>
                <p className="font-bold text-xs">Awaiting Execution</p>
                <p className="text-[11px] text-slate-600 max-w-sm mt-0.5 leading-normal">
                  Choose a tRPC preset above or configure a path, then click "Run Test Request" to retrieve live data from the server.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Explanation of Testing & Flow */}
      <div className="bg-[#161920]/40 border border-slate-800/60 rounded-lg p-3.5 flex items-start gap-3 text-xs leading-relaxed">
        <Shield className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <span className="font-bold text-slate-300">How to test and what to check?</span>
          <p className="text-slate-400">
            1. **Query Game State**: Select <strong className="text-indigo-400">Global Server Stats</strong> and hit "Run Test Request". This queries the live game data database directly.
          </p>
          <p className="text-slate-400">
            2. **Look Up Live Prices**: Select <strong className="text-indigo-400">Active Market Offers</strong> to fetch actual player sell/buy order tickets and analyze resource market pricing in real-time.
          </p>
          <p className="text-slate-400">
            3. **Proxy Integrity**: The requests go through <code className="text-slate-300">/api/warera/*</code> on our custom Express container backend, which forwards query envelopes server-to-server. This bypasses the browser's security restrictions and resolves CORS blocks completely.
          </p>
        </div>
      </div>

    </div>
  );
}
