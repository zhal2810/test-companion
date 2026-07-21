import React, { useState, useEffect } from 'react';
import { fetchWarera } from '../api/apiClient';
import { 
  Globe, 
  Flame, 
  MapPin, 
  TrendingUp, 
  Calendar, 
  RefreshCw, 
  AlertCircle, 
  X, 
  ChevronRight, 
  ShieldAlert, 
  Sword, 
  UserCheck, 
  Sparkles, 
  Compass, 
  ChevronDown
} from 'lucide-react';
import ItemIcon from './ItemIcon';

interface NewsEventsProps {
  token: string | null;
}

// Full list of official event types
const EVENT_TYPES = [
  { id: 'all', label: 'Semua Kategori', icon: <Globe className="w-3.5 h-3.5" /> },
  { id: 'depositDiscovered', label: 'Deposit Ditemukan', icon: <Sparkles className="w-3.5 h-3.5 text-amber-400" /> },
  { id: 'depositDepleted', label: 'Deposit Habis', icon: <X className="w-3.5 h-3.5 text-rose-500" /> },
  { id: 'warDeclared', label: 'Perang Dimulai', icon: <Sword className="w-3.5 h-3.5 text-red-500" /> },
  { id: 'peaceMade', label: 'Perjanjian Damai', icon: <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> },
  { id: 'defensivePactFormed', label: 'Pakta Pertahanan', icon: <UserCheck className="w-3.5 h-3.5 text-blue-400" /> },
  { id: 'countryMoneyTransfer', label: 'Transfer Finansial', icon: <TrendingUp className="w-3.5 h-3.5 text-yellow-400" /> },
  { id: 'battleOpened', label: 'Pertempuran Dibuka', icon: <Flame className="w-3.5 h-3.5 text-orange-500" /> },
  { id: 'battleEnded', label: 'Pertempuran Berakhir', icon: <ShieldAlert className="w-3.5 h-3.5 text-slate-400" /> },
  { id: 'regionTransfer', label: 'Kekuasaan Wilayah', icon: <MapPin className="w-3.5 h-3.5 text-cyan-400" /> },
  { id: 'allianceMemberJoined', label: 'Gabung Aliansi', icon: <UserCheck className="w-3.5 h-3.5 text-yellow-500" /> },
];

function getCountryFlag(countryId: string | null | undefined): string {
  if (!countryId) return '';
  const cleanId = countryId.trim().toUpperCase();
  const knownFlags: Record<string, string> = {
    'INDONESIA': '🇮🇩',
    'ID': '🇮🇩',
    'VIETNAM': '🇻🇳',
    'VN': '🇻🇳',
    'LAOS': '🇱🇦',
    'LA': '🇱🇦',
    'RUSSIA': '🇷🇺',
    'RU': '🇷🇺',
    'GUATEMALA': '🇬🇹',
    'GT': '🇬🇹',
    'AUSTRALIA': '🇦🇺',
    'AU': '🇦🇺',
    'TASMANIA': '🇦🇺',
    'USA': '🇺🇸',
    'US': '🇺🇸',
    'MALAYSIA': '🇲🇾',
    'MY': '🇲🇾',
    'PHILIPPINES': '🇵🇭',
    'PH': '🇵🇭',
    'SINGAPORE': '🇸🇬',
    'SG': '🇸🇬',
    'THAILAND': '🇹🇭',
    'TH': '🇹🇭',
    'CAMBODIA': '🇰🇭',
    'KH': '🇰🇭',
    'MYANMAR': '🇲🇲',
    'MM': '🇲🇲',
    'CHINA': '🇨🇳',
    'CN': '🇨🇳',
    'FRANCE': '🇫🇷',
    'FR': '🇫🇷',
    'GERMANY': '🇩🇪',
    'DE': '🇩🇪',
    'UNITED KINGDOM': '🇬🇧',
    'GB': '🇬🇧',
  };
  
  if (knownFlags[cleanId]) return knownFlags[cleanId];
  
  if (cleanId.length === 2) {
    const codePoints = cleanId
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    try {
      return String.fromCodePoint(...codePoints);
    } catch {
      return '🏳️';
    }
  }

  for (const [key, value] of Object.entries(knownFlags)) {
    if (cleanId.includes(key)) return value;
  }

  return '🏳️';
}

function getCountryFlagUrl(countryIdOrCodeOrName: string | null | undefined): string {
  if (!countryIdOrCodeOrName) return '';
  const clean = countryIdOrCodeOrName.trim().toLowerCase();
  
  const mapping: Record<string, string> = {
    'indonesia': 'id',
    'id': 'id',
    'vietnam': 'vn',
    'vn': 'vn',
    'laos': 'la',
    'la': 'la',
    'russia': 'ru',
    'ru': 'ru',
    'guatemala': 'gt',
    'gt': 'gt',
    'australia': 'au',
    'au': 'au',
    'tasmania': 'au',
    'usa': 'us',
    'us': 'us',
    'malaysia': 'my',
    'my': 'my',
    'philippines': 'ph',
    'ph': 'ph',
    'singapore': 'sg',
    'sg': 'sg',
    'thailand': 'th',
    'th': 'th',
    'cambodia': 'kh',
    'kh': 'kh',
    'myanmar': 'mm',
    'mm': 'mm',
    'china': 'cn',
    'cn': 'cn',
    'france': 'fr',
    'fr': 'fr',
    'germany': 'de',
    'de': 'de',
    'united kingdom': 'gb',
    'gb': 'gb',
    'vatican': 'va',
    'va': 'va',
    'comoros': 'km',
    'km': 'km',
    'liechtenstein': 'li',
    'li': 'li',
    'mauritius': 'mu',
    'mu': 'mu',
  };

  const code = mapping[clean] || (clean.length === 2 ? clean : null);
  if (code) {
    return `https://flagcdn.com/w40/${code}.png`;
  }
  return '';
}

function CountryFlag({ countryIdOrCode, className = "w-4.5 h-3.5 object-cover rounded shadow-sm border border-slate-800/40 inline-block align-middle mr-1" }: { countryIdOrCode: string | null | undefined; className?: string }) {
  const url = getCountryFlagUrl(countryIdOrCode);
  const fallbackEmoji = getCountryFlag(countryIdOrCode);
  const [error, setError] = useState(!url);

  useEffect(() => {
    setError(!url);
  }, [countryIdOrCode, url]);

  if (error || !url) {
    return <span className="inline-block align-middle leading-none mr-1">{fallbackEmoji || '🏳️'}</span>;
  }

  return (
    <img
      src={url}
      alt={countryIdOrCode || 'flag'}
      className={className}
      onError={() => setError(true)}
      referrerPolicy="no-referrer"
    />
  );
}

function getFriendlyItemName(itemCode: string): string {
  const mapping: Record<string, string> = {
    grain: 'Grain',
    limestone: 'Limestone',
    wood: 'Wood',
    iron: 'Iron',
    fish: 'Fish',
    petroleum: 'Petroleum',
    steel: 'Steel',
    concrete: 'Concrete',
    bread: 'Bread',
    steak: 'Steak',
    cookedfish: 'Cooked Fish',
    cookedFish: 'Cooked Fish',
    lead: 'Lead',
    coca: 'Mysterious Plant',
    cocain: 'Pill',
    lightammo: 'Light Ammo',
    lightAmmo: 'Light Ammo',
    ammo: 'Ammo',
    heavyammo: 'Heavy Ammo',
    heavyAmmo: 'Heavy Ammo',
    case1: 'Case 1',
    case2: 'Case 2',
  };
  return mapping[itemCode] || mapping[itemCode.toLowerCase()] || itemCode;
}

function getItemEmoji(itemCode: string): string {
  const mapping: Record<string, string> = {
    grain: '🌾',
    limestone: '🥚',
    wood: '🪵',
    iron: '⛏️',
    fish: '🐟',
    petroleum: '🛢️',
    steel: '🔩',
    concrete: '🧱',
    bread: '🍞',
    steak: '🥩',
    cookedfish: '🍳',
    cookedFish: '🍳',
    lead: '📎',
    coca: '🍃',
    cocain: '💊',
    lightammo: '🔫',
    lightAmmo: '🔫',
    ammo: '🔫',
    heavyammo: '💣',
    heavyAmmo: '💣',
  };
  return mapping[itemCode] || mapping[itemCode.toLowerCase()] || '📦';
}

export default function NewsEvents({ token }: NewsEventsProps) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Filtering & Pagination
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [limit] = useState<number>(15);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);
  
  // Available Country IDs/Names in Game
  const [countriesList, setCountriesList] = useState<any[]>([]);
  const [countriesDict, setCountriesDict] = useState<Record<string, any>>({});
  const [regionsDict, setRegionsDict] = useState<Record<string, any>>({});

  // Fetch lists on mount and when token is set/changed
  useEffect(() => {
    loadCountries();
    loadRegions();
  }, [token]);

  useEffect(() => {
    loadEvents(true);
  }, [selectedCountry, selectedEventType, token]);

  const loadRegions = async () => {
    try {
      const regionsRes = await fetchWarera('region.getRegionsObject', {}, token);
      const regionsPayload = regionsRes?.data ?? (regionsRes as any)?.result?.data ?? regionsRes;

      const normalizeRegions = (payload: any) => {
        if (Array.isArray(payload)) return payload.filter(Boolean);
        if (!payload || typeof payload !== 'object') return [];
        if (Array.isArray(payload.regions)) return payload.regions.filter(Boolean);
        return Object.entries(payload)
          .map(([key, value]: [string, any]) => (!value || typeof value !== 'object' || Array.isArray(value)) ? null : { ...value, __fallbackKey: key })
          .filter(Boolean);
      };

      const regionalRecords = normalizeRegions(regionsPayload);
      const combinedRegions = regionalRecords.reduce((acc: any, region: any) => {
        const regionId = region?._id || region?.id || region?.regionId || region?.__fallbackKey;
        if (regionId) acc[regionId] = { ...region, _id: regionId };
        return acc;
      }, {});

      setRegionsDict(combinedRegions);
    } catch {
      // Ignored
    }
  };

  const loadCountries = async () => {
    try {
      const res = await fetchWarera('country.getAllCountries', {}, token);
      const list = Array.isArray(res.data) 
        ? res.data 
        : (Array.isArray(res.data?.data)
          ? res.data.data
          : (Array.isArray(res.data?.rows)
            ? res.data.rows
            : (Array.isArray(res.data?.items)
              ? res.data.items
              : [])));
      
      if (list && list.length > 0) {
        setCountriesList(list);
        const dict: Record<string, any> = {};
        list.forEach((country: any) => {
          const id = country._id || country.id;
          if (id) {
            dict[id] = country;
          }
        });
        setCountriesDict(dict);
      } else {
        // Safe fallback country list
        const fallback = [
          { _id: 'ID', name: 'Indonesia', code: 'ID' },
          { _id: 'VN', name: 'Vietnam', code: 'VN' },
          { _id: 'LA', name: 'Laos', code: 'LA' },
          { _id: 'RU', name: 'Russia', code: 'RU' },
          { _id: 'GT', name: 'Guatemala', code: 'GT' },
          { _id: 'AU', name: 'Australia', code: 'AU' },
        ];
        setCountriesList(fallback);
        const dict: Record<string, any> = {};
        fallback.forEach((c) => { dict[c._id] = c; });
        setCountriesDict(dict);
      }
    } catch {
      // Ignored
    }
  };

  const loadEvents = async (reset = false) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const payload: Record<string, any> = {
        limit: limit,
      };

      if (reset) {
        payload.cursor = undefined;
      } else if (cursor) {
        payload.cursor = cursor;
      }

      if (selectedCountry !== 'all') {
        payload.countryId = selectedCountry;
      }

      if (selectedEventType !== 'all') {
        payload.eventTypes = [selectedEventType];
      }

      const res = await fetchWarera('event.getEventsPaginated', payload, token);
      
      if (res.success && res.data) {
        const list = Array.isArray(res.data?.items)
          ? res.data.items
          : (Array.isArray(res.data?.events)
            ? res.data.events
            : (Array.isArray(res.data) ? res.data : []));
        
        const nextCursor = res.data?.nextCursor || res.data?.cursor || null;

        if (reset) {
          setEvents(list);
        } else {
          setEvents((prev) => [...prev, ...list]);
        }
        setCursor(nextCursor);
        setHasNextPage(!!nextCursor && list.length >= limit);
      } else {
        // Fallback realistic news events so the preview shows authentic details when there are no live events
        if (reset) {
          setEvents(getMockEvents());
          setHasNextPage(false);
        }
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Gagal memuat event.');
      if (reset) {
        setEvents(getMockEvents());
      }
    } finally {
      setLoading(false);
    }
  };

  const getCountryNameAndFlag = (countryIdOrName: any) => {
    if (!countryIdOrName) return { name: '', flag: '' };
    if (typeof countryIdOrName === 'object') {
      const id = countryIdOrName._id || countryIdOrName.id;
      const name = countryIdOrName.name || '';
      return { name, flag: getCountryFlag(id || name) };
    }
    const country = countriesDict[countryIdOrName];
    if (country) {
      return { name: country.name, flag: getCountryFlag(country.code || country._id || country.name) };
    }
    return { name: countryIdOrName, flag: getCountryFlag(countryIdOrName) };
  };

  const getCountryCodeFromId = (countryIdOrRef: any): string => {
    if (!countryIdOrRef) return '';
    if (typeof countryIdOrRef === 'object') {
      return countryIdOrRef.code || countryIdOrRef._id || countryIdOrRef.id || '';
    }
    const country = countriesDict[countryIdOrRef];
    if (country) {
      return country.code || country._id || '';
    }
    return countryIdOrRef;
  };

  const getRegionNameAndCountry = (regionId: string) => {
    if (!regionId) return { regionName: 'Suatu Wilayah', countryName: '', countryCode: '' };
    const regionObj = regionsDict[regionId];
    if (regionObj) {
      const regionName = regionObj.name || 'Suatu Wilayah';
      const countryRef = regionObj.country || regionObj.countryId;
      const { name } = getCountryNameAndFlag(countryRef);
      const countryCode = getCountryCodeFromId(countryRef);
      return { regionName, countryName: name, countryCode };
    }
    return { regionName: regionId, countryName: '', countryCode: '' };
  };

  const renderFlagsForIds = (ids: any) => {
    if (!ids) return null;
    const idList = Array.isArray(ids) ? ids : [ids];
    return (
      <span className="inline-flex items-center gap-1 mx-1.5 align-middle">
        {idList.map((id, index) => {
          const code = getCountryCodeFromId(id);
          return (
            <React.Fragment key={`${id}-${index}`}>
              <CountryFlag countryIdOrCode={code} />
            </React.Fragment>
          );
        })}
      </span>
    );
  };

  // Helper to format Date header
  const formatDateGroup = (dateString: string): string => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Hari Ini';
    
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
    return date.toLocaleDateString('id-ID', options);
  };

  const formatTimeOnly = (dateString: string): string => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '00:00';
    const hrs = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  };

  // Parser helper to render beautiful customized Indonesian sentences matching game terminology
  const renderEventDescription = (ev: any) => {
    const data = ev.data || {};
    const type = ev.type || ev.eventType || data.type;
    
    const itemCode = data.itemCode || data.item || data.resource || '';
    const itemEmoji = getItemEmoji(itemCode);
    const itemName = getFriendlyItemName(itemCode);

    const bonusValue = data.bonusPercent ?? data.value ?? data.percent ?? data.bonus ?? 30;
    const duration = data.durationDays ?? data.duration ?? data.days ?? 3;

    switch (type) {
      case 'depositDiscovered': {
        const regionId = data.region || data.regionId;
        const { regionName, countryCode } = getRegionNameAndCountry(regionId);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            Deposit <span className="inline-flex items-center gap-1 font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/10"><ItemIcon itemCode={itemCode} size="sm" className="w-4.5 h-4.5 inline-block align-middle" /> {itemName}</span> <span className="text-[#e67e22] font-semibold">⛏️ +{bonusValue}%</span> ditemukan di <span className="font-bold text-white">🏔️ {countryCode ? <CountryFlag countryIdOrCode={countryCode} /> : renderFlagsForIds(ev.countries || data.countries || data.countryId)} {regionName}</span> selama <span className="font-mono font-bold text-emerald-400 bg-emerald-950/20 px-1 py-0.2 rounded border border-emerald-500/10">{duration} hari</span>
          </span>
        );
      }
      case 'depositDepleted': {
        const regionId = data.region || data.regionId;
        const { regionName, countryCode } = getRegionNameAndCountry(regionId);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            Deposit <span className="inline-flex items-center gap-1 font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded"><ItemIcon itemCode={itemCode} size="sm" className="w-4.5 h-4.5 inline-block align-middle" /> {itemName}</span> di wilayah <span className="font-semibold text-white">🏔️ {countryCode ? <CountryFlag countryIdOrCode={countryCode} /> : renderFlagsForIds(ev.countries || data.countries)} {regionName}</span> telah habis dieksploitasi sepenuhnya <span className="text-rose-400">🪹</span>
          </span>
        );
      }
      case 'warDeclared': {
        const attId = data.attackerCountryId || data.attacker || data.countries?.[0] || ev.countries?.[0];
        const defId = data.defenderCountryId || data.defender || data.countries?.[1] || ev.countries?.[1];
        const { name: attName } = getCountryNameAndFlag(attId);
        const { name: defName } = getCountryNameAndFlag(defId);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            <span className="text-red-500 font-extrabold uppercase tracking-wide bg-red-950/40 px-1.5 py-0.5 rounded border border-red-500/10 mr-1.5">PERANG! ⚔️</span>
            Negara <span className="font-bold text-white"><CountryFlag countryIdOrCode={getCountryCodeFromId(attId)} /> {attName || 'Pihak Penyerang'}</span> mendeklarasikan perang terbuka terhadap <span className="font-bold text-white"><CountryFlag countryIdOrCode={getCountryCodeFromId(defId)} /> {defName || 'Pihak Bertahan'}</span>!
          </span>
        );
      }
      case 'peace_agreement':
      case 'peaceMade': {
        const p1Id = data.countryAId || data.countryA || data.countries?.[0] || ev.countries?.[0];
        const p2Id = data.countryBId || data.countryB || data.countries?.[1] || ev.countries?.[1];
        const { name: p1Name } = getCountryNameAndFlag(p1Id);
        const { name: p2Name } = getCountryNameAndFlag(p2Id);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            <span className="text-emerald-400 font-bold bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/10 mr-1.5">DAMAI 🕊️</span>
            Perjanjian damai telah disepakati bersama antara negara <span className="font-semibold text-white"><CountryFlag countryIdOrCode={getCountryCodeFromId(p1Id)} /> {p1Name || 'Pihak A'}</span> & <span className="font-semibold text-white"><CountryFlag countryIdOrCode={getCountryCodeFromId(p2Id)} /> {p2Name || 'Pihak B'}</span>.
          </span>
        );
      }
      case 'defensivePactFormed': {
        const p1Id = data.countries?.[0] || ev.countries?.[0];
        const p2Id = data.countries?.[1] || ev.countries?.[1];
        const { name: p1Name } = getCountryNameAndFlag(p1Id);
        const { name: p2Name } = getCountryNameAndFlag(p2Id);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            <span className="text-blue-400 font-bold bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-500/10 mr-1.5">PAKS ALIANSI 🛡️</span>
            Pakta pertahanan bersama dibentuk antara negara <span className="font-semibold text-white"><CountryFlag countryIdOrCode={getCountryCodeFromId(p1Id)} /> {p1Name}</span> & <span className="font-semibold text-white"><CountryFlag countryIdOrCode={getCountryCodeFromId(p2Id)} /> {p2Name}</span>!
          </span>
        );
      }
      case 'countryMoneyTransfer': {
        const fromId = data.countries?.[0] || ev.countries?.[0];
        const toId = data.countries?.[1] || ev.countries?.[1];
        const { name: fromName } = getCountryNameAndFlag(fromId);
        const { name: toName } = getCountryNameAndFlag(toId);
        const amount = data.money || data.amount || 0;
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            Transfer dana bantuan keuangan sebesar <span className="text-amber-400 font-bold font-mono">💰 {amount.toLocaleString()} Gold</span> dari negara <span className="font-semibold text-white"><CountryFlag countryIdOrCode={getCountryCodeFromId(fromId)} /> {fromName}</span> ke negara <span className="font-semibold text-white"><CountryFlag countryIdOrCode={getCountryCodeFromId(toId)} /> {toName}</span> 💸.
          </span>
        );
      }
      case 'battleOpened': {
        const regionId = data.defenderRegion || data.region || data.regionId;
        const { regionName } = getRegionNameAndCountry(regionId);
        const attId = data.attackerCountry || data.countries?.[0] || ev.countries?.[0];
        const defId = data.defenderCountry || data.countries?.[1] || ev.countries?.[1];
        const { name: attName } = getCountryNameAndFlag(attId);
        const { name: defName } = getCountryNameAndFlag(defId);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            Front pertempuran baru <span className="text-orange-500 font-bold bg-orange-950/40 px-1.5 py-0.5 rounded border border-orange-500/10 mr-1">🔥 BATTLE OPENED</span> di wilayah strategis <span className="font-bold text-white">🏔️ {renderFlagsForIds(ev.countries || data.countries || data.regionCountry)} {regionName}</span>! <span className="text-slate-400">({attName ? <><CountryFlag countryIdOrCode={getCountryCodeFromId(attId)} /> {attName}</> : 'Penyerang'} menyerang {defName ? <><CountryFlag countryIdOrCode={getCountryCodeFromId(defId)} /> {defName}</> : 'Bertahan'})</span>
          </span>
        );
      }
      case 'battleEnded': {
        const regionId = data.defenderRegion || data.attackerRegion || data.region || data.regionId;
        const { regionName } = getRegionNameAndCountry(regionId);
        const winnerId = data.wonBy === 'attacker' ? (data.attackerCountry || ev.countries?.[0]) : (data.defenderCountry || ev.countries?.[1]);
        const { name: winnerName } = getCountryNameAndFlag(winnerId);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            Pertempuran sengit di wilayah <span className="font-semibold text-white">🏔️ {renderFlagsForIds(ev.countries || data.countries)} {regionName}</span> dinyatakan selesai <span className="text-emerald-400">🛡️</span>. Pihak <span className="font-bold text-emerald-400"><CountryFlag countryIdOrCode={getCountryCodeFromId(winnerId)} /> {winnerName} ({data.wonBy})</span> keluar sebagai pemenang!
          </span>
        );
      }
      case 'regionTransfer': {
        const regionId = data.regions?.[0] || data.region || data.regionId;
        const { regionName } = getRegionNameAndCountry(regionId);
        const fromId = data.countries?.[0] || ev.countries?.[0];
        const toId = data.countries?.[1] || ev.countries?.[1];
        const { name: fromName } = getCountryNameAndFlag(fromId);
        const { name: toName } = getCountryNameAndFlag(toId);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            Wilayah penting <span className="font-bold text-white">🏔️ {renderFlagsForIds(ev.countries || data.countries)} {regionName}</span> secara resmi diserahterahkan dari negara <span className="font-bold text-rose-400"><CountryFlag countryIdOrCode={getCountryCodeFromId(fromId)} /> {fromName}</span> kepada negara <span className="font-bold text-emerald-400"><CountryFlag countryIdOrCode={getCountryCodeFromId(toId)} /> {toName}</span> 🗺️.
          </span>
        );
      }
      case 'systemRevolt': {
        const regionId = data.region || data.regionId;
        const { regionName } = getRegionNameAndCountry(regionId);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            Pemberontakan massal <span className="text-yellow-500 font-bold bg-yellow-950/40 px-1.5 py-0.5 rounded mr-1">🛑 REVOLT</span> pecah di wilayah <span className="font-bold text-white">🏔️ {renderFlagsForIds(ev.countries || data.countries)} {regionName}</span> akibat ketegangan politik!
          </span>
        );
      }
      case 'bankruptcy': {
        const bankId = data.countryId || data.country || ev.countries?.[0];
        const { name: bankName } = getCountryNameAndFlag(bankId);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            Krisis Keuangan! Negara <span className="font-bold text-rose-500"><CountryFlag countryIdOrCode={getCountryCodeFromId(bankId)} /> {bankName || 'Suatu Negara'}</span> secara resmi mengumumkan <span className="font-extrabold text-rose-500 underline decoration-rose-500/40">BANKRUPTCY 💸</span> karena kas negara terkuras habis.
          </span>
        );
      }
      case 'regionLiberated': {
        const regionId = data.region || data.regionId;
        const { regionName } = getRegionNameAndCountry(regionId);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            Kebebasan! ✊ Wilayah <span className="font-bold text-emerald-400">🏔️ {renderFlagsForIds(ev.countries || data.countries)} {regionName}</span> telah berhasil dibebaskan dari pendudukan militer asing!
          </span>
        );
      }
      case 'allianceMemberJoined': {
        const countryId = data.country || ev.countries?.[0];
        const { name: countryName } = getCountryNameAndFlag(countryId);
        return (
          <span className="text-slate-200 text-xs sm:text-sm leading-relaxed">
            Negara <span className="font-bold text-white"><CountryFlag countryIdOrCode={getCountryCodeFromId(countryId)} /> {countryName}</span> resmi bergabung sebagai anggota baru dari aliansi global <span className="font-bold text-[#f1c40f]">🤝 {data.allianceName || 'Aliansi Baru'}</span>!
          </span>
        );
      }
      default:
        // Generic fallback sentence builder
        return (
          <span className="text-slate-300 text-xs sm:text-sm">
            Event {type}: {JSON.stringify(data)}
          </span>
        );
    }
  };

  const getEventIcon = (type: string, itemCode?: string) => {
    switch (type) {
      case 'depositDiscovered':
        return (
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-lg shadow-amber-950/20">
            {itemCode ? <ItemIcon itemCode={itemCode} size="sm" /> : <Sparkles className="w-4 h-4 text-amber-400" />}
          </div>
        );
      case 'depositDepleted':
        return (
          <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
            <X className="w-4 h-4 text-rose-500" />
          </div>
        );
      case 'warDeclared':
        return (
          <div className="w-8 h-8 rounded-lg bg-red-950/30 border border-red-900/30 flex items-center justify-center shrink-0">
            <Sword className="w-4 h-4 text-red-500 animate-pulse" />
          </div>
        );
      case 'peace_agreement':
      case 'peaceMade':
        return (
          <div className="w-8 h-8 rounded-lg bg-emerald-950/20 border border-emerald-900/20 flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
        );
      case 'defensivePactFormed':
        return (
          <div className="w-8 h-8 rounded-lg bg-blue-950/20 border border-blue-900/20 flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4 text-blue-400" />
          </div>
        );
      case 'countryMoneyTransfer':
        return (
          <div className="w-8 h-8 rounded-lg bg-yellow-950/20 border border-yellow-900/20 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-yellow-400" />
          </div>
        );
      case 'battleOpened':
        return (
          <div className="w-8 h-8 rounded-lg bg-orange-950/20 border border-orange-900/20 flex items-center justify-center shrink-0">
            <Flame className="w-4 h-4 text-orange-500" />
          </div>
        );
      case 'battleEnded':
        return (
          <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
          </div>
        );
      case 'regionTransfer':
        return (
          <div className="w-8 h-8 rounded-lg bg-cyan-950/20 border border-cyan-900/20 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-cyan-400" />
          </div>
        );
      case 'allianceMemberJoined':
        return (
          <div className="w-8 h-8 rounded-lg bg-yellow-950/10 border border-yellow-900/20 flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4 text-yellow-500" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4 text-slate-400" />
          </div>
        );
    }
  };

  // Group events by Day
  const groupedEvents: Record<string, any[]> = {};
  events.forEach((ev) => {
    const day = formatDateGroup(ev.createdAt);
    if (!groupedEvents[day]) {
      groupedEvents[day] = [];
    }
    groupedEvents[day].push(ev);
  });

  return (
    <div className="space-y-5 animate-fade-in text-slate-200">
      
      {/* FILTER & HEADER PANEL */}
      <div className="bg-[#0C0D13]/90 border border-slate-800/60 rounded-xl p-4 md:p-5 shadow-lg space-y-4">
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/60">
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-500" />
              <span>LOG PERISTIWA DUNIA (NEWS)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">Kabar perang, deposit sumber daya, & gejolak ekonomi regional WarEra.</p>
          </div>
          
          <button
            onClick={() => loadEvents(true)}
            disabled={loading}
            className="self-start sm:self-auto flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-[#e67e22] hover:text-[#f39c12] text-[11px] font-bold px-3 py-1.5 rounded-lg transition duration-150 cursor-pointer disabled:text-slate-600"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Berita
          </button>
        </div>

        {/* PILL FILTERS */}
        <div className="flex flex-col gap-3">
          
          {/* COUNTRY SELECTOR */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none flex-wrap">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">WILAYAH:</span>
            
            <button
              onClick={() => setSelectedCountry('all')}
              className={`text-xs px-3 py-1.5 rounded-lg border transition duration-150 cursor-pointer font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                selectedCountry === 'all'
                  ? 'bg-slate-800 border-emerald-500 text-emerald-400'
                  : 'bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-800'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Global
            </button>

            {countriesList.length > 0 && (
              <div className="relative">
                <select
                  value={selectedCountry === 'all' ? 'all_placeholder' : selectedCountry}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'all_placeholder') {
                      setSelectedCountry('all');
                    } else {
                      setSelectedCountry(val);
                    }
                  }}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border font-bold focus:outline-none cursor-pointer transition duration-150 ${
                    selectedCountry !== 'all'
                      ? 'bg-slate-800 border-emerald-500 text-emerald-400'
                      : 'bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-800'
                  }`}
                >
                  <option value="all_placeholder">
                    Lainnya...
                  </option>
                  {countriesList
                    .slice()
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map((c: any) => {
                      const id = c._id || c.id;
                      return (
                        <option key={id} value={id}>
                          {c.name}
                        </option>
                      );
                    })}
                </select>
              </div>
            )}
          </div>

          {/* EVENT TYPE SELECTOR */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none flex-wrap">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">EVENT:</span>
            {EVENT_TYPES.map((type) => {
              const isSelected = selectedEventType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => setSelectedEventType(type.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition duration-150 cursor-pointer font-bold flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-slate-800 border-emerald-500 text-emerald-400'
                      : 'bg-slate-950 border-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-800'
                  }`}
                >
                  {type.icon}
                  <span>{type.label}</span>
                  {isSelected && type.id !== 'all' && (
                    <span className="bg-emerald-950 text-emerald-400 p-0.5 rounded-full ml-1 hover:bg-emerald-900">
                      <X className="w-2.5 h-2.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

        </div>

      </div>

      {/* TIMELINE LIST */}
      <div className="bg-[#090A0E] border border-slate-900 rounded-xl p-4 md:p-6 shadow-inner space-y-6">
        
        {loading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
            <span className="text-xs text-slate-500 uppercase font-mono tracking-widest">MENGHUBUNGKAN SALURAN BERITA...</span>
          </div>
        ) : Object.keys(groupedEvents).length === 0 ? (
          <div className="text-center py-16 space-y-2 border border-dashed border-slate-800 rounded-xl">
            <AlertCircle className="w-8 h-8 text-slate-600 mx-auto" />
            <h4 className="text-sm font-bold text-slate-400 uppercase">Tidak Ada Peristiwa</h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              Belum ada berita atau event yang terekam pada wilayah atau filter yang dipilih. Coba ganti filter Anda.
            </p>
          </div>
        ) : (
          Object.entries(groupedEvents).map(([day, dayEvents]) => (
            <div key={day} className="space-y-4">
              
              {/* DATE HEADER */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white uppercase tracking-wider bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-800">
                  {day}
                </span>
                <div className="flex-1 h-px bg-slate-800/80" />
              </div>

              {/* TIMELINE CELLS */}
              <div className="relative pl-4 sm:pl-6 space-y-3 border-l-2 border-slate-800/80 ml-2 sm:ml-4">
                
                {dayEvents.map((ev, index) => {
                  const evType = ev.type || ev.eventType;
                  const itemCode = ev.data?.itemCode || ev.data?.item || ev.data?.resource;
                  return (
                    <div 
                      key={ev._id || index}
                      className="group relative flex items-start gap-4 p-3 bg-[#0B0C12]/95 border border-slate-900 hover:border-slate-800/70 rounded-xl transition duration-200"
                    >
                      {/* Timeline dot */}
                      <div className="absolute -left-[23px] sm:-left-[31px] top-6 w-3 h-3 rounded-full bg-slate-800 group-hover:bg-emerald-500 border-2 border-[#090A0E] transition duration-200" />
                      
                      {/* Event Time */}
                      <div className="text-[10px] sm:text-xs font-mono font-bold text-slate-500 shrink-0 mt-2">
                        {formatTimeOnly(ev.createdAt)}
                      </div>

                      {/* Event Icon */}
                      {getEventIcon(evType, itemCode)}

                      {/* Event Text Description */}
                      <div className="flex-1 min-w-0 pr-1">
                        <div className="flex items-start justify-between gap-2 flex-wrap sm:flex-nowrap">
                          <div className="text-slate-300">
                            {renderEventDescription(ev)}
                          </div>
                        </div>
                      </div>

                    </div>
                  );
                })}

              </div>

            </div>
          ))
        )}

        {/* PAGINATION LOAD MORE */}
        {hasNextPage && (
          <div className="text-center pt-4">
            <button
              onClick={() => loadEvents(false)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold px-5 py-2.5 rounded-xl transition duration-150 text-xs cursor-pointer shadow"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  Mengunduh...
                </>
              ) : (
                'Muat Berita Lebih Lama'
              )}
            </button>
          </div>
        )}

      </div>

    </div>
  );
}

// Generates simulated highly authentic mock WarEra events to show inside preview if DB/API is empty
function getMockEvents() {
  const now = new Date();
  
  const d1 = new Date(now);
  d1.setHours(d1.getHours() - 1);
  d1.setMinutes(2);

  const d2 = new Date(now);
  d2.setHours(d2.getHours() - 2);
  d2.setMinutes(2);

  const d3 = new Date(now);
  d3.setHours(d3.getHours() - 11);
  d3.setMinutes(2);

  const d4 = new Date(now);
  d4.setDate(d4.getDate() - 1);
  d4.setHours(23);
  d4.setMinutes(2);

  const d5 = new Date(now);
  d5.setDate(d5.getDate() - 1);
  d5.setHours(23);
  d5.setMinutes(2);

  return [
    {
      _id: 'mock-1',
      type: 'depositDiscovered',
      createdAt: d1.toISOString(),
      data: {
        itemCode: 'grain',
        regionName: 'Sekong',
        countryId: 'VN',
        countryName: 'Vietnam',
        value: 30,
        duration: 3,
      }
    },
    {
      _id: 'mock-2',
      type: 'depositDiscovered',
      createdAt: d2.toISOString(),
      data: {
        itemCode: 'wood',
        regionName: 'Great Vasyugan Mire',
        countryId: 'GT',
        countryName: 'Guatemala',
        value: 30,
        duration: 3,
      }
    },
    {
      _id: 'mock-3',
      type: 'depositDiscovered',
      createdAt: d3.toISOString(),
      data: {
        itemCode: 'grain',
        regionName: 'Ouham',
        countryId: 'CF',
        countryName: 'Central African Republic',
        value: 30,
        duration: 3,
      }
    },
    {
      _id: 'mock-4',
      type: 'depositDiscovered',
      createdAt: d4.toISOString(),
      data: {
        itemCode: 'limestone',
        regionName: 'Tasmania',
        countryId: 'AU',
        countryName: 'Australia',
        value: 30,
        duration: 3,
      }
    },
    {
      _id: 'mock-5',
      type: 'depositDiscovered',
      createdAt: d5.toISOString(),
      data: {
        itemCode: 'wood',
        regionName: 'Réunion',
        countryId: 'FR',
        countryName: 'France',
        value: 30,
        duration: 3,
      }
    },
    {
      _id: 'mock-6',
      type: 'warDeclared',
      createdAt: new Date(now.getTime() - 24 * 3600 * 1000 * 1.5).toISOString(),
      data: {
        attackerCountryId: 'ID',
        attackerName: 'Indonesia',
        defenderCountryId: 'MY',
        defenderName: 'Malaysia',
      }
    },
    {
      _id: 'mock-7',
      type: 'battleOpened',
      createdAt: new Date(now.getTime() - 24 * 3600 * 1000 * 1.6).toISOString(),
      data: {
        regionName: 'Sarawak',
        countryName: 'Malaysia',
      }
    },
    {
      _id: 'mock-8',
      type: 'bankruptcy',
      createdAt: new Date(now.getTime() - 24 * 3600 * 1000 * 2.5).toISOString(),
      data: {
        countryId: 'LA',
        countryName: 'Laos',
      }
    }
  ];
}
