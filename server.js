import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { User } from '@/entities/User';
import { Player } from '@/entities/Player';
import { SystemMessage } from '@/entities/SystemMessage';
import { Friend } from '@/entities/Friend';
import { GamePortal } from '@/entities/GamePortal';
import { Area } from '@/entities/Area';
import { Notification } from '@/entities/Notification';
import { ChatMessage } from '@/entities/ChatMessage';
import { Item } from '@/entities/Item';
import { BodySkin } from '@/entities/BodySkin';
import { ArcadePortal } from '@/entities/ArcadePortal';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ClickToMoveController } from '../components/sync/ClickToMoveController';
import socketManager from '../components/sync/SocketManager';
import { clearAvatarCache, loadAvatarData } from '../components/avatars/AvatarSystem';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'sonner';
import toastManager from '../components/utils/ToastManager';
import { AreaTransitionScreen } from '../components/game/AreaTransitionScreen';

import { Loader2, ArrowRightLeft, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import PlayerCard from '../components/game/PlayerCard';
import GiftWindow from '../components/game/GiftWindow';
import SystemMessageDisplay from '../components/game/SystemMessageDisplay';
import FriendsList from '../components/game/FriendsList';
import GameMap from '../components/game/GameMap';
import SecurityManager from '../components/security/SecurityManager';
import InGameChat from '../components/game/InGameChat';
import BottomToolbar from '../components/game/BottomToolbar';
import SingleSessionManager from '../components/utils/SingleSessionManager';
import AdminToolbar from '../components/game/AdminToolbar';
import RightSidePanel from '../components/game/RightSidePanel';
import MyStuffPopup from '../components/game/MyStuffPopup';
import ShopPopup from '../components/game/ShopPopup';
import TradeRequestToast from '../components/game/trading/TradeRequestToast';
import TradeWindow from '../components/game/trading/TradeWindow';
import { Trade } from '@/entities/Trade';
import { ChatBubbleConfig } from '@/entities/ChatBubbleConfig';
import UserPlayerSync from '../components/utils/UserPlayerSync';
import AutoAdminFixer from '../components/utils/AutoAdminFixer';
import ImageWithFallback from '../components/utils/ImageWithFallback';
import PlayerAvatar from '../components/game/PlayerAvatar';
import WorldStore from '../components/sync/WorldStore';
import SubscriptionGrantPopup from '../components/game/SubscriptionGrantPopup';
import SubscriptionRequiredPopup from '../components/game/SubscriptionRequiredPopup';

const RENDER_SERVER_URL = 'https://touch-world-server.onrender.com';
const PLACEHOLDER_BG = 'https://via.placeholder.com/1380x770/000000/FFFFFF?text=Touch+World';
const BASE_WIDTH = 1380;
const BASE_HEIGHT = 770;

// Client-side caches
const itemAtlas = new Map();
const skinAtlas = new Map();

const initializeItemAtlas = (items) => {
  console.log('Initializing Item Atlas with', items.length, 'items');
  items.forEach(item => itemAtlas.set(item.id, item));
};
const initializeSkinAtlas = (skins) => {
  console.log('Initializing Skin Atlas with', skins.length, 'skins');
  skins.forEach(skin => skinAtlas.set(skin.id, skin));
};

export default function Game() {
  const [user, setUser] = useState(null);
  const [player, setPlayer] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [players, setPlayers] = useState([]);

  const [showPlayerCardPopup, setShowPlayerCardPopup] = useState(false);
  const [selectedPlayerForCard, setSelectedPlayerForCard] = useState(null);
  const [showMyStuff, setShowMyStuff] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showGiftWindow, setShowGiftWindow] = useState(false);
  const [giftTarget, setGiftTarget] = useState(null);
  const [showGameMap, setShowGameMap] = useState(false);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false);
  const [showCatalogShopPopup, setShowCatalogShopPopup] = useState(false);

  const [systemMessage, setSystemMessage] = useState(null);
  const [currentAreaKey, setCurrentAreaKey] = useState('city');
  const [areas, setAreas] = useState([]);
  const [portals, setPortals] = useState([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [targetArea, setTargetArea] = useState(null);
  const [isUIVisible, setIsUIVisible] = useState(true);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [isChangingArea, setIsChangingArea] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isInvisible, setIsInvisible] = useState(false);
  const [keepAwayMode, setKeepAwayMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState('');
  const [lastBubbleCheck, setLastBubbleCheck] = useState({});
  const [playerForMyStuff, setPlayerForMyStuff] = useState(null);
  const [bubbleConfig, setBubbleConfig] = useState(null);
  const [tradeRequest, setTradeRequest] = useState(null);
  const [pendingOutboundTrade, setPendingOutboundTrade] = useState(null);
  const [activeTrade, setActiveTrade] = useState(null);
  const [isTradeWindowOpen, setIsTradeWindowOpen] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [activeShopCatalogId, setActiveShopCatalogId] = useState(null);
  const [bottomToolbarButtons, setBottomToolbarButtons] = useState([]);
  const [showSubscriptionGrant, setShowSubscriptionGrant] = useState(false);
  const [showAreaSubscriptionPopup, setShowAreaSubscriptionPopup] = useState(false);
  const [lockedAreaDetails, setLockedAreaDetails] = useState(null);
  const [clickBlockMap, setClickBlockMap] = useState([]);
  const [arcadePortals, setArcadePortals] = useState([]);

  const navigate = useNavigate();
  const gameAreaRef = useRef(null);
  const gameContainerRef = useRef(null);

  const store = useMemo(() => new WorldStore(), []);
  const moveController = useMemo(() => new ClickToMoveController(store), [store]);

  const areaToDisplay = useMemo(() => {
    return areas.find(a => a.area_id === currentAreaKey) || areas[0] || { area_name: 'אזור לא ידוע', background_image: null };
  }, [areas, currentAreaKey]);

  const areaDecorations = useMemo(() => {
    if (!areaToDisplay?.decorations) return [];
    try {
      const parsed = typeof areaToDisplay.decorations === 'string'
        ? JSON.parse(areaToDisplay.decorations)
        : areaToDisplay.decorations;
      return Array.isArray(parsed) ? parsed.map(d => ({ ...d, is_flipped: d.is_flipped || false })) : [];
    } catch (e) {
      console.warn("Failed to parse area decorations:", e);
      return [];
    }
  }, [areaToDisplay]);

  const lastFrameTime = useRef(performance.now());
  const initializationAttempted = useRef(false);
  const worldStore = useRef(null);

  const handleOpenCatalog = useCallback(async (catalogId) => {
    setActiveShopCatalogId(catalogId);
    setShowShop(true);
  }, []);

  const handleClosePopup = useCallback(() => {
    setShowMyStuff(false);
    setShowShop(false);
    setActiveShopCatalogId(null);
    setShowGiftWindow(false);
    setGiftTarget(null);
    setShowGameMap(false);
    setShowPlayerCardPopup(false);
    setSelectedPlayerForCard(null);
    setShowCatalogShopPopup(false);
    setShowAreaSubscriptionPopup(false);
    setLockedAreaDetails(null);
  }, []);

  const fetchChatBubbleConfig = useCallback(async () => {
    try {
      console.log('Fetching chat bubble config...');
      const records = await ChatBubbleConfig.filter({ name: 'default_config' });
      if (records.length > 0) {
        setBubbleConfig(records[0]);
        console.log('✅ Chat bubble config loaded.');
      } else {
        setBubbleConfig(null);
        console.warn('No default chat bubble config found.');
      }
    } catch (error) {
      console.error('Failed to fetch chat bubble config:', error);
    }
  }, []);

  useEffect(() => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 WebSocket Configuration:');
    console.log('📍 Server URL:', RENDER_SERVER_URL);
    console.log('🌐 Current Page:', window.location.href);
    console.log('🔒 Protocol:', window.location.protocol);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const preventContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', preventContextMenu);
    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
    };
  }, []);

  useEffect(() => {
    const handleOpenPopupEvent = (event) => {
      const { popup } = event.detail;
      if (popup === 'MyStuffPopup') setShowMyStuff(true);
      else if (popup === 'ShopPopup') {
        setActiveShopCatalogId(null);
        setShowShop(true);
      }
      else if (popup === 'GameMap') setShowGameMap(true);
      else if (popup === 'FriendsList') setIsSidePanelOpen(true);
    };

    window.addEventListener('openGamePopup', handleOpenPopupEvent);

    const handlePlayerUpdate = (event) => {
      const updatedPlayer = event.detail;
      const isTradeActive = !!activeTrade || isTradeWindowOpen;
      if (isTradeActive) {
        console.log("Player update event ignored due to active trade.");
        return;
      }

      if (player && updatedPlayer.id === player.id) {
        setPlayerForMyStuff(prev => ({ ...prev, ...updatedPlayer }));
        if (store.myPlayer) Object.assign(store.myPlayer, updatedPlayer);
        setPlayers(prevPlayers => prevPlayers.map(p => p.id === updatedPlayer.id ? { ...p, ...updatedPlayer } : p));
      }
    };
    window.addEventListener('playerUpdated', handlePlayerUpdate);

    const handleAvatarDataUpdate = async () => {
      await loadAvatarData();
      setPlayers(prevPlayers => [...prevPlayers]);
    };
    window.addEventListener('avatarDataUpdated', handleAvatarDataUpdate);

    const handleBubbleConfigUpdate = () => {
      fetchChatBubbleConfig();
    };
    window.addEventListener('chatBubbleConfigUpdated', handleBubbleConfigUpdate);

    return () => {
      window.removeEventListener('openGamePopup', handleOpenPopupEvent);
      window.removeEventListener('playerUpdated', handlePlayerUpdate);
      window.removeEventListener('avatarDataUpdated', handleAvatarDataUpdate);
      window.removeEventListener('chatBubbleConfigUpdated', handleBubbleConfigUpdate);
    };
  }, [player, store, activeTrade, isTradeWindowOpen, fetchChatBubbleConfig]);

  const forceSyncUserData = useCallback(async () => {
    if (!user) return;
    try {
      const [currentUser, playerRecords] = await Promise.all([User.me(), Player.filter({ user_id: user.id })]);
      if (currentUser) setUser(currentUser);
      if (playerRecords && playerRecords.length > 0) {
        const freshPlayer = playerRecords[0];
        setPlayer(freshPlayer);
        setPlayerForMyStuff(freshPlayer);
        if (store.myPlayer) Object.assign(store.myPlayer, freshPlayer);
      }
    } catch (error) {
      console.error('Failed to force sync:', error);
    }
  }, [user, store]);

  useEffect(() => {
    const handleXPUpdate = async (event) => {
      const { userId } = event.detail || {};
      if (userId === user?.id) {
        await forceSyncUserData();
      }
    };
    window.addEventListener('xpUpdated', handleXPUpdate);
    return () => window.removeEventListener('xpUpdated', handleXPUpdate);
  }, [user, forceSyncUserData]);

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      socketManager.disconnect();
      if (player?.id) {
        await Player.update(player.id, { is_online: false, session_id: null, is_invisible: false, keep_away_mode: false });
      }
      await User.logout();
      navigate(createPageUrl('Home'));
    } catch (error) {
      console.error("Logout failed:", error);
      toastManager.error("שגיאה ביציאה מהמערכת.");
      navigate(createPageUrl('Home'));
    } finally {
      setIsLoggingOut(false);
    }
  }, [navigate, isLoggingOut, player]);

  const toggleInvisibility = useCallback(async () => {
    if (!player || !user) return;
    const newVisibility = !isInvisible;
    setIsInvisible(newVisibility);
    if (store.myPlayer) store.myPlayer.is_invisible = newVisibility;
    try {
      await Player.update(player.id, { is_invisible: newVisibility });
      SecurityManager.logSecurityEvent(
        user.id,
        newVisibility ? 'admin_invisible_on' : 'admin_invisible_off',
        'medium',
        `Admin ${user.display_name || user.email} turned invisibility ${newVisibility ? 'ON' : 'OFF'}`
      );
      toastManager.success(`מצב התגנבות: ${newVisibility ? 'מופעל' : 'כבוי'}`);
    } catch (error) {
      console.error("Failed to toggle invisibility:", error);
      setIsInvisible(!newVisibility);
      if (store.myPlayer) store.myPlayer.is_invisible = !newVisibility;
      toastManager.error('שגיאה בשינוי מצב התגנבות. נסה שוב.');
    }
  }, [isInvisible, player, user, store]);

  const toggleKeepAwayMode = useCallback(async () => {
    if (!player || !user) return;
    const newKeepAwayState = !keepAwayMode;
    setKeepAwayMode(newKeepAwayState);
    if (store.myPlayer) store.myPlayer.keep_away_mode = newKeepAwayState;
    try {
      await Player.update(player.id, { keep_away_mode: newKeepAwayState });
      SecurityManager.logSecurityEvent(
        user.id,
        newKeepAwayState ? 'admin_keep_away_on' : 'admin_keep_away_off',
        'medium',
        `Admin ${user.display_name || user.email} turned Keep Away Mode ${newKeepAwayState ? 'ON' : 'OFF'}`
      );
      toastManager.success(`מצב שמירת מרחק: ${newKeepAwayState ? 'מופעל' : 'כבוי'}`);
    } catch (error) {
      console.error("Failed to toggle Keep Away Mode:", error);
      setKeepAwayMode(!newKeepAwayState);
      if (store.myPlayer) store.myPlayer.keep_away_mode = !newKeepAwayState;
      toastManager.error('שגיאה בשינוי מצב שמירת מרחק.');
    }
  }, [keepAwayMode, player, user, store]);

  const handleToolbarClick = useCallback((button) => {
    if (button.action_type === 'POPUP') {
      if (button.action_value === 'MyStuffPopup') setShowMyStuff(prev => !prev);
      else if (button.action_value === 'ShopPopup') {
        setActiveShopCatalogId(null);
        setShowShop(prev => !prev);
      }
      else if (button.action_value === 'GameMap') setShowGameMap(prev => !prev);
      else if (button.action_value === 'FriendsList') setIsSidePanelOpen(prev => !prev);
      else if (button.action_value === 'SettingsPopup') setIsSidePanelOpen(prev => !prev);
      return;
    }
    if (button.action_type === 'PAGE') {
      navigate(createPageUrl(button.action_value));
    } else if (button.action_type === 'FUNCTION') {
      if (button.action_value === 'toggleInvisibility') {
        toggleInvisibility();
      } else if (button.action_value === 'toggleKeepAwayMode') {
        toggleKeepAwayMode();
      } else if (button.action_value === 'logout') {
        handleLogout();
      }
    } else if (button.action_type === 'CATALOG') {
      handleOpenCatalog(button.action_value);
    }
  }, [navigate, toggleInvisibility, handleLogout, toggleKeepAwayMode, handleOpenCatalog]);

  const handleChangeArea = useCallback(async (newAreaId) => {
    if (!store.myPlayer || newAreaId === currentAreaKey || isChangingArea || isTransitioning) {
      handleClosePopup();
      return;
    }
    const targetAreaDetails = areas.find(a => a.area_id === newAreaId);
    if (!targetAreaDetails) {
      toastManager.error("אזור לא קיים.");
      return;
    }
    const isUserSubscribed = user.active_subscription_tier && user.active_subscription_tier !== 'none';
    if (targetAreaDetails.is_members_only && !isUserSubscribed) {
      setLockedAreaDetails(targetAreaDetails);
      setShowAreaSubscriptionPopup(true);
      handleClosePopup();
      return;
    }
    if (user.level < targetAreaDetails.min_level) {
      toastManager.error(`נדרשת רמה ${targetAreaDetails.min_level} כדי להיכנס לאזור זה.`);
      handleClosePopup();
      return;
    }

    setIsChangingArea(true);
    handleClosePopup();
    setIsTransitioning(true);
    setTargetArea(newAreaId);

    try {
      await Player.update(player.id, { current_area: newAreaId });
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error("Error changing area:", error);
      toastManager.error("❌ אירעה שגיאה בשינוי אזור.");
      setIsTransitioning(false);
      setTargetArea(null);
    }
  }, [store.myPlayer, currentAreaKey, isChangingArea, isTransitioning, player, handleClosePopup, areas, user]);

  useEffect(() => {
    if (initializationAttempted.current) return;
    initializationAttempted.current = true;

    const loadSocketIoClient = () => {
      return new Promise((resolve, reject) => {
        if (window.io) {
          console.log('Socket.IO client already loaded.');
          return resolve();
        }
        console.log('Loading Socket.IO client library from CDN...');
        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          console.log('✅ Socket.IO client loaded successfully.');
          resolve();
        };
        script.onerror = (error) => {
          console.error('❌ Failed to load Socket.IO client library.', error);
          reject(new Error('Failed to load Socket.IO client.'));
        };
        document.body.appendChild(script);
      });
    };

    const initializeGame = async () => {
      setIsLoading(true);
      console.log('🎮 Starting game initialization...');

      try {
        clearAvatarCache();

        let currentUser = await User.me();
        if (!currentUser) {
          toastManager.error('עליך להתחבר כדי לשחק');
          navigate(createPageUrl('Home'));
          return;
        }

        if (!currentUser.admin_level) {
          currentUser = await User.update(currentUser.id, { admin_level: 'user' });
        }

        currentUser = await UserPlayerSync.checkAndFixOnLogin(currentUser.id);
        if (!currentUser) {
          toastManager.error('שגיאה באימות המשתמש');
          navigate(createPageUrl('Home'));
          return;
        }

        const nowIso = new Date().toISOString();
        if (currentUser.active_subscription_tier !== 'none' && currentUser.subscription_expires_at > nowIso && !currentUser.has_seen_subscription_welcome) {
          setShowSubscriptionGrant(true);
          User.update(currentUser.id, { has_seen_subscription_welcome: true }).catch(e => console.error("Failed to update has_seen_subscription_welcome:", e));
        }

        if (currentUser.admin_level !== 'admin' && currentUser.admin_level !== 'senior_touch' && SecurityManager.isProtectedUser(currentUser)) {
          currentUser = await User.update(currentUser.id, { admin_level: 'admin' });
          toastManager.info("הרשאות ניהול הוחזרו.");
        }

        setUser(currentUser);
        SecurityManager.setCurrentUser(currentUser.id);

        if (currentUser.is_banned) {
          const banMessage = currentUser.ban_expires_at
            ? `חשבונך נחסם עד ${new Date(currentUser.ban_expires_at).toLocaleString('ה־IL')}.`
            : 'חשבונך נחסם לצמיתות.';
          toastManager.error(banMessage);
          await User.logout();
          navigate('/');
          return;
        }

        const [allAreaData, playerRecords, notificationsToProcess, itemsData, skinsData, portalRecordsData, arcadePortalsData] = await Promise.all([
          Area.filter({ is_active: true }),
          Player.filter({ user_id: currentUser.id }),
          Notification.filter({ user_id: currentUser.id, is_read: false }),
          Item.filter({ is_deleted: { "$ne": true } }, '-created_date', 5000),
          BodySkin.filter({ is_active: true }),
          GamePortal.list(),
          ArcadePortal.list(),
        ]);

        const areas = Array.isArray(allAreaData) ? allAreaData : [];
        const items = Array.isArray(itemsData) ? itemsData : [];
        const skins = Array.isArray(skinsData) ? skinsData : [];
        const portals = Array.isArray(portalRecordsData) ? portalRecordsData : [];
        const arcadePortals = Array.isArray(arcadePortalsData) ? arcadePortalsData : [];

        setAreas(areas);
        setPortals(portals);
        setArcadePortals(arcadePortals);
        initializeItemAtlas(items);
        initializeSkinAtlas(skins);

        await fetchChatBubbleConfig();

        if (!areas || areas.length === 0) {
          toastManager.error("שגיאה קריטית: לא נמצאו אזורים פעילים במשחק.");
          return;
        }

        if (notificationsToProcess && notificationsToProcess.length > 0) {
          // חשוב: לא להשתמש ב-JSX כאן כדי למנוע דליפה לקוד צד-שרת
          notificationsToProcess.forEach(notif => {
            toastManager.info(notif.title || 'הודעה חדשה!', {
              description: notif.message,
              duration: 10000
            });
          });
          await Promise.all(notificationsToProcess.map(n => Notification.update(n.id, { is_read: true })));
        }

        if (!playerRecords || playerRecords.length === 0) {
          navigate(createPageUrl('CreatePlayer'));
          return;
        }

        let playerData = playerRecords[0];

        if (playerData.admin_level !== currentUser.admin_level) {
          try {
            playerData = await Player.update(playerData.id, { admin_level: currentUser.admin_level });
            toastManager.info("הרשאות השחקן שלך סונכרנו.");
          } catch (e) {
            console.error("Failed to sync player admin level", e);
          }
        }

        const newSessionId = `${currentUser.id}_${Date.now()}`;
        await Player.update(playerData.id, {
          session_id: newSessionId,
          is_online: true,
          last_activity: new Date().toISOString()
        });

        SingleSessionManager.init(currentUser.id, newSessionId, (reason) => {
          setIsDisconnected(true);
          setDisconnectReason(reason);
          toastManager.error(reason);
        });

        const updatedPlayer = { ...playerData, session_id: newSessionId };
        setPlayer(updatedPlayer);
        setPlayerForMyStuff(updatedPlayer);
        const playerArea = updatedPlayer.current_area || 'city';
        setCurrentAreaKey(playerArea);
        setIsInvisible(updatedPlayer.is_invisible || false);
        setKeepAwayMode(updatedPlayer.keep_away_mode || false);

        const defaultBottomButtons = [
          { id: 'myStuffBtn', label: 'הדברים שלי', icon: 'Backpack', action_type: 'POPUP', action_value: 'MyStuffPopup', order: 1, admin_level_required: ['user', 'moderator', 'senior_touch', 'admin'] },
          { id: 'shopBtn', label: 'חנות', icon: 'ShoppingBag', action_type: 'POPUP', action_value: 'ShopPopup', order: 2, admin_level_required: ['user', 'moderator', 'senior_touch', 'admin'] },
          { id: 'friendsBtn', label: 'חברים', icon: 'Users', action_type: 'POPUP', action_value: 'FriendsList', order: 3, admin_level_required: ['user', 'moderator', 'senior_touch', 'admin'] },
          { id: 'mapBtn', label: 'מפה', icon: 'MapIcon', action_type: 'POPUP', action_value: 'GameMap', order: 4, admin_level_required: ['user', 'moderator', 'senior_touch', 'admin'] },
          { id: 'invisibilityToggleBtn', label: 'התגנבות', icon: 'Eye', action_type: 'FUNCTION', action_value: 'toggleInvisibility', order: 5, admin_level_required: ['moderator', 'senior_touch', 'admin'] },
          { id: 'settingsBtn', label: 'הגדרות', icon: 'Settings', action_type: 'POPUP', action_value: 'FriendsList', order: 6, admin_level_required: ['user', 'moderator', 'senior_touch', 'admin'] },
          { id: 'logoutBtn', label: 'יציאה', icon: 'Power', action_type: 'FUNCTION', action_value: 'logout', order: 10, admin_level_required: ['user', 'moderator', 'senior_touch', 'admin'] },
        ];
        const filteredButtons = defaultBottomButtons
          .filter(btn => btn.admin_level_required.includes(currentUser.admin_level))
          .sort((a, b) => a.order - b.order);
        setBottomToolbarButtons(filteredButtons);

        const currentAreaData = areas.find(a => a.area_id === playerArea);
        const parseMap = (jsonString) => {
          try { return jsonString ? JSON.parse(jsonString) : []; } catch { return []; }
        };
        setClickBlockMap(parseMap(currentAreaData?.click_block_map));
        moveController.setCollisionMaps({
          general: parseMap(currentAreaData?.collision_map),
          vip: parseMap(currentAreaData?.vip_zones),
          admin: parseMap(currentAreaData?.admin_only_zones)
        });

        await loadAvatarData();

        store.init(updatedPlayer);
        const isAdminOrMod = currentUser.admin_level === 'admin' || currentUser.admin_level === 'senior_touch';
        const baseSpeed = 120;
        const finalSpeed = isAdminOrMod ? baseSpeed * 2 : baseSpeed;
        store.setMoveSpeed(finalSpeed);
        moveController.move_speed = finalSpeed;

        const now = new Date().toISOString();
        const activeMessages = await SystemMessage.filter({ is_active: true, expires_at: { '$gte': now } }, '-created_date', 1);
        if (activeMessages && activeMessages.length > 0) {
          const message = activeMessages[0];
          const seen = JSON.parse(localStorage.getItem('seenSystemMessages') || '[]');
          if (!seen.includes(message.id)) setSystemMessage(message);
        }

        // Connect multiplayer
        try {
          await loadSocketIoClient();
          await socketManager.connect(RENDER_SERVER_URL, newSessionId);
          setIsSocketConnected(true);

          socketManager.on('system_event', (event) => {
            if (event.event_type === 'SHUTDOWN_NOTICE') {
              setDisconnectReason('השרת יורד לעדכון. נתראה בקרוב.!');
              setIsDisconnected(true);
            } else if (event.event_type === 'CHAT_CONFIG_UPDATED') {
              toastManager.info('🔄 הגדרות צ\'אט ודרגות התעדכנו!');
              fetchChatBubbleConfig();
            } else if (event.event_type === 'ITEM_DATA_UPDATED') {
              toastManager.info('🔄 נתוני הפריטים עודכנו!');
              window.dispatchEvent(new Event('avatarDataUpdated'));
            }
          });

          socketManager.on('force_disconnect', (data) => {
            setIsDisconnected(true);
            setDisconnectReason(data.reason);
            socketManager.disconnect();
          });
        } catch (error) {
          console.error('❌ Multiplayer connection failed:', error);
          toastManager.error("ההתחברות לשרת המשחק נכשלה.");
          setIsSocketConnected(false);
        }

        setIsReady(true);
        setIsLoading(false);
      } catch (error) {
        console.error('❌ Initialization failed:', error);
        setIsLoading(false);
        toastManager.error('שגיאה באתחול. רענן את הדף.');
      }
    };

    initializeGame();

    return () => {
      SingleSessionManager.cleanup();
      socketManager.disconnect();
      if (player?.id) {
        Player.update(player.id, {
          is_online: false,
          session_id: null,
          is_invisible: false,
          keep_away_mode: false
        }).catch(e => console.error('Failed to update offline status:', e));
      }
    };
  }, [navigate, store, moveController, fetchChatBubbleConfig, handleOpenCatalog, handleChangeArea]);

  useEffect(() => {
    if (bubbleConfig) store.setBubbleDuration(bubbleConfig.bubble_duration_seconds * 1000);
    else store.setBubbleDuration(15000);
  }, [bubbleConfig, store]);

  useEffect(() => {
    if (!isReady || !user || !player) return;

    let animationFrameId;
    let lastSyncTime = 0;
    const SYNC_INTERVAL = 33;

    const handlePlayersUpdate = (data) => {
      if (data.players && Array.isArray(data.players)) {
        data.players.forEach(pData => {
          if (pData.id !== store.myPlayer?.id) store.updatePlayer(pData);
        });
        const activePlayerIds = data.players.map(p => p.id);
        store.removeInactivePlayers(activePlayerIds);
        setPlayers(store.getAllPlayers().map(p => ({ ...p })));
      }
    };

    const handlePlayerLeft = (data) => {
      if (data.playerId) {
        store.removePlayer(data.playerId);
        setPlayers(store.getAllPlayers().map(p => ({ ...p })));
      }
    };

    const handleBubbleMessage = (data) => {
      const targetPlayer = store.getPlayer(data.playerId);
      if (targetPlayer) {
        targetPlayer.bubbleMessage = { text: data.message, timestamp: data.timestamp || Date.now() };
        setPlayers(store.getAllPlayers().map(p => ({ ...p })));
      }
    };

    const handleIncomingTradeRequest = async (data) => {
      if (player && data.receiver_id === player.id) {
        const tradeRecord = await Trade.get(data.tradeId);
        if (tradeRecord && (!tradeRequest || tradeRequest.id !== tradeRecord.id)) {
          setTradeRequest(tradeRecord);
        }
      }
    };

    const handleTradeUpdate = async (data) => {
      if (activeTrade && data.tradeId === activeTrade.id) {
        const updatedTrade = await Trade.get(data.tradeId);
        if (updatedTrade) {
          setActiveTrade(updatedTrade);
          if (updatedTrade.status === 'completed') {
            toastManager.success("ההחלפה הושלמה!");
            forceSyncUserData();
            setIsTradeWindowOpen(false);
            setActiveTrade(null);
          } else if (updatedTrade.status === 'cancelled') {
            toastManager.info("ההחלפה בוטלה");
            setIsTradeWindowOpen(false);
            setActiveTrade(null);
          }
        }
      } else if (pendingOutboundTrade && data.tradeId === pendingOutboundTrade.id) {
        const updatedTrade = await Trade.get(data.tradeId);
        if (updatedTrade) {
          if (updatedTrade.status === 'active') {
            setActiveTrade(updatedTrade);
            setIsTradeWindowOpen(true);
            setPendingOutboundTrade(null);
            toastManager.success(`בקשת ההחלפה אושרה!`);
          } else if (updatedTrade.status === 'cancelled') {
            toastManager.error(`בקשת ההחלפה נדחתה`);
            setPendingOutboundTrade(null);
          }
        }
      }
    };

    socketManager.on('playersUpdate', handlePlayersUpdate);
    socketManager.on('playerLeft', handlePlayerLeft);
    socketManager.on('bubbleMessage', handleBubbleMessage);
    socketManager.on('tradeRequest', handleIncomingTradeRequest);
    socketManager.on('tradeUpdate', handleTradeUpdate);

    const gameLoop = (timestamp) => {
      if (!isReady || !store.myPlayer) {
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
      }
      const rawDelta = (timestamp - lastFrameTime.current) / 1000;
      const delta = Math.min(rawDelta, 0.1);
      lastFrameTime.current = timestamp;

      store.updateFrame(delta);

      if (timestamp - lastSyncTime >= SYNC_INTERVAL) {
        if (socketManager.isSocketConnected() && store.myPlayer) {
          socketManager.sendPlayerState(store.myPlayer);
        }
        lastSyncTime = timestamp;
      }

      moveController.checkArrival();
      setPlayers(store.getAllPlayers().map(p => ({ ...p })));
      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      socketManager.off('playersUpdate', handlePlayersUpdate);
      socketManager.off('playerLeft', handlePlayerLeft);
      socketManager.off('bubbleMessage', handleBubbleMessage);
      socketManager.off('tradeRequest', handleIncomingTradeRequest);
      socketManager.off('tradeUpdate', handleTradeUpdate);
    };
  }, [isReady, user, player, store, moveController, activeTrade, pendingOutboundTrade, tradeRequest, forceSyncUserData]);

  const isPointInPolygon = (point, polygon) => {
    let x = point.x, y = point.y;
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      let xi = polygon[i].x, yi = polygon[i].y;
      let xj = polygon[j].x, yj = polygon[j].y;
      let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) isInside = !isInside;
    }
    return isInside;
  };

  const handleGameAreaClick = useCallback((e) => {
    if (!gameAreaRef.current || !isReady || !store.myPlayer) return;
    if (showPlayerCardPopup || showMyStuff || showShop || showGiftWindow || showGameMap || isTradeWindowOpen || showCatalogShopPopup || isSidePanelOpen || showAreaSubscriptionPopup) {
      return;
    }

    const rect = gameAreaRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const foregroundDecorations = (areaDecorations || []).filter(d => d.layer === 1).reverse();
    for (const deco of foregroundDecorations) {
      if (deco.is_portal_to || deco.catalog_id) {
        const decoLeft = (deco.x / 100) * BASE_WIDTH;
        const decoTop = (deco.y / 100) * BASE_HEIGHT;
        const decoWidth = (deco.width / 100) * BASE_WIDTH;
        const decoHeight = (deco.height / 100) * BASE_HEIGHT;

        if (clickX >= decoLeft && clickX <= decoLeft + decoWidth &&
            clickY >= decoTop && clickY <= decoTop + decoHeight) {
          if (deco.catalog_id) {
            handleOpenCatalog(deco.catalog_id);
          } else if (deco.is_portal_to) {
            const worldX = decoLeft + decoWidth / 2;
            const worldY = decoTop + decoHeight;
            moveController.setDestination(worldX, worldY, () => handleChangeArea(deco.is_portal_to));
          }
          return;
        }
      }
    }

    const clickPoint = { x: clickX, y: clickY };
    for (const polygon of clickBlockMap) {
      if (isPointInPolygon(clickPoint, polygon)) {
        console.log("🖱️ Click blocked by click_block_map polygon.");
        return;
      }
    }

    if (clickX >= 0 && clickX <= BASE_WIDTH && clickY >= 0 && clickY <= BASE_HEIGHT) {
      moveController.onClick(clickX, clickY);
    }
  }, [moveController, store.myPlayer, isReady, showPlayerCardPopup, showMyStuff, showShop, showGiftWindow, showGameMap, isTradeWindowOpen, showCatalogShopPopup, isSidePanelOpen, clickBlockMap, showAreaSubscriptionPopup, areaDecorations, handleChangeArea, handleOpenCatalog]);

  const handlePlayerClick = useCallback((clickedPlayer) => {
    if (clickedPlayer.id === store.myPlayer?.id) return;
    setSelectedPlayerForCard(clickedPlayer);
    setShowPlayerCardPopup(true);
  }, [store.myPlayer]);

  const handleAddFriend = async () => {
    if (!store.myPlayer || !selectedPlayerForCard || !user || isAddingFriend) return;
    setIsAddingFriend(true);
    setShowPlayerCardPopup(false);
    try {
      const existingFriend = await Friend.filter({ user_id: user.id, friend_id: selectedPlayerForCard.user_id });
      if (existingFriend && existingFriend.length > 0) {
        toastManager.info('השחקן כבר ברשימת החברים שלך!');
        setIsAddingFriend(false);
        return;
      }
      await Friend.create({
        user_id: user.id,
        user_username: store.myPlayer.username,
        friend_id: selectedPlayerForCard.user_id,
        friend_username: selectedPlayerForCard.username
      });
      toastManager.success(`✅ ${selectedPlayerForCard.username} התווסף לחברים שלך!`);
    } catch (error) {
      console.error("Friend add error:", error);
      toastManager.error("❌ אירעה שגיאה בהוספת החבר.");
    } finally {
      setIsAddingFriend(false);
    }
  };

  const handleTradeRequest = async () => {
    if (!player || !selectedPlayerForCard || pendingOutboundTrade) {
      toastManager.info("לא ניתן לשלוח בקשה כרגע.");
      return;
    }
    setShowPlayerCardPopup(false);
    try {
      const newTrade = await Trade.create({
        initiator_id: player.id,
        initiator_username: player.username,
        receiver_id: selectedPlayerForCard.id,
        receiver_username: selectedPlayerForCard.username,
        status: 'pending',
        expires_at: new Date(Date.now() + 60000).toISOString()
      });
      setPendingOutboundTrade(newTrade);
      socketManager.sendTradeRequest(newTrade.id, newTrade.initiator_id, newTrade.receiver_id);
      toastManager.success(`בקשת החלפה נשלחה אל ${selectedPlayerForCard.username}`);
    } catch (error) {
      toastManager.error("שגיאה בשליחת בקשת החלפה.");
      console.error(error);
    }
  };

  const handleAcceptTrade = async () => {
    if (!tradeRequest || !player) return;
    try {
      const updatedTrade = await Trade.update(tradeRequest.id, { status: 'active' });
      setActiveTrade(updatedTrade);
      setIsTradeWindowOpen(true);
      setTradeRequest(null);
      socketManager.sendTradeUpdate(updatedTrade.id, 'active', updatedTrade);
      toastManager.success(`אושרה החלפה עם ${updatedTrade.initiator_username}!`);
    } catch (error) {
      toastManager.error("שגיאה באישור ההחלפה.");
      console.error(error);
    }
  };

  const handleDeclineTrade = async () => {
    if (!tradeRequest) return;
    try {
      const updatedTrade = await Trade.update(tradeRequest.id, { status: 'cancelled' });
      socketManager.sendTradeUpdate(updatedTrade.id, 'cancelled', updatedTrade);
    } catch (error) {
      console.error("Error declining trade:", error);
      toastManager.error("שגיאה בביטול בקשת ההחלפה.");
    } finally {
      setTradeRequest(null);
    }
  };

  const handleCloseTradeWindow = async () => {
    if (activeTrade && activeTrade.status !== 'completed' && activeTrade.status !== 'cancelled') {
      try {
        const currentTradeState = await Trade.get(activeTrade.id);
        if (currentTradeState && (currentTradeState.status === 'active' || currentTradeState.status === 'pending')) {
          const updatedTrade = await Trade.update(activeTrade.id, { status: 'cancelled' });
          socketManager.sendTradeUpdate(activeTrade.id, 'cancelled', updatedTrade);
          toastManager.info("ההחלפה בוטלה.");
        }
      } catch (e) {
        console.error("Error cancelling trade on close:", e);
        toastManager.error("שגיאה בביטול החלפה.");
      }
    }
    setIsTradeWindowOpen(false);
    setActiveTrade(null);
  };

  const handleCloseSystemMessage = () => {
    if (systemMessage) {
      const seenMessages = JSON.parse(localStorage.getItem('seenSystemMessages') || '[]');
      if (!seenMessages.includes(systemMessage.id)) {
        seenMessages.push(systemMessage.id);
        const recentMessages = seenMessages.slice(-50);
        localStorage.setItem('seenSystemMessages', JSON.stringify(recentMessages));
      }
    }
    setSystemMessage(null);
  };

  const handleMessageSent = useCallback(async (message) => {
    if (store.myPlayer && player && user && socketManager.isSocketConnected()) {
      try {
        await ChatMessage.create({
          user_id: user.id,
          username: player.username,
          admin_level: user.admin_level || 'user',
          message: message,
          area_id: player.current_area,
        });

        socketManager.sendBubbleMessage(
          player.id,
          message,
          player.username,
          user.admin_level || 'user'
        );

        store.myPlayer.bubbleMessage = {
          text: message,
          timestamp: Date.now()
        };
        setPlayers(store.getAllPlayers().map(p => ({ ...p })));

      } catch (error) {
        console.error("Failed to send bubble message:", error);
      }
    }
  }, [store, player, user]);

  if (isDisconnected) {
    return (
      <div className="h-screen bg-gradient-to-br from-purple-900 to-black flex items-center justify-center text-white z-[200]">
        <div className="text-center bg-black/60 backdrop-blur-xl border border-red-500/50 rounded-2xl p-8 max-w-md">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold mb-4">החיבור נותק</h2>
          <p className="text-lg mb-6">{disconnectReason}</p>
          <p className="text-sm text-gray-400 mb-6">
            ניתן לשחק רק מחלונית אחת בכל זמן נתון.<br />
            החלונית החדשה השתלטה על החיבור.
          </p>
          <Button onClick={() => window.location.reload()} className="bg-purple-600 hover:bg-purple-700">
            טען מחדש את המשחק
          </Button>
        </div>
        <Toaster richColors position="top-center" />
      </div>
    );
  }

  if (isLoading || !isReady || !player || !user || areas.length === 0) {
    return (
      <div className="h-screen bg-gradient-to-br from-purple-900 to-black flex items-center justify-center text-white z-[200]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4">
            <Loader2 className="h-full w-full animate-spin" />
          </div>
          <div className="text-xl">טוען את עולם טאץ'...</div>
          {!isSocketConnected && isReady && (
            <div className="text-sm text-yellow-400 mt-2">מתחבר לשרת...</div>
          )}
        </div>
        <Toaster richColors position="top-center" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      {user && <AutoAdminFixer user={user} />}

      <div dir="rtl" id="game-page-container" className="relative h-screen w-screen flex items-center justify-center bg-sky-500 overflow-hidden select-none" onContextMenu={(e) => e.preventDefault()} style={{ userSelect: 'none' }} draggable="false">
        <Toaster richColors position="top-center" />

        <div
          ref={gameAreaRef}
          className="relative w-[1380px] h-[770px] flex-shrink-0 bg-black rounded-lg shadow-2xl overflow-hidden z-10 pointer-events-auto"
          onClick={handleGameAreaClick}
        >
          <img
            src={areaToDisplay.background_image || PLACEHOLDER_BG}
            alt={areaToDisplay.area_name}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            draggable="false"
          />

          {areaDecorations.filter(d => d.layer === 0).map(deco => (
            <div
              key={deco.id}
              data-interactive-object="true"
              className="absolute"
              style={{
                left: `${deco.x}%`,
                top: `${deco.y}%`,
                width: `${deco.width}%`,
                height: `${deco.height}%`,
                zIndex: 10,
                cursor: deco.is_portal_to || deco.catalog_id ? 'pointer' : 'default',
                transform: deco.is_flipped ? 'scaleX(-1)' : 'none',
                pointerEvents: 'auto'
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (deco.catalog_id) {
                  handleOpenCatalog(deco.catalog_id);
                } else if (deco.is_portal_to) {
                  const worldX = (deco.x + deco.width / 2) / 100 * BASE_WIDTH;
                  const worldY = (deco.y + deco.height) / 100 * BASE_HEIGHT;
                  moveController.setDestination(worldX, worldY, () => handleChangeArea(deco.is_portal_to));
                }
              }}
            >
              <ImageWithFallback src={deco.image_url} className="w-full h-full object-contain pointer-events-none" alt="" draggable="false" />
            </div>
          ))}

          <div className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 20 }}>
            {players.map(p => (
              <PlayerAvatar
                key={p.id}
                player={p}
                currentUser={user}
                bubbleConfig={bubbleConfig}
                onPlayerClick={p.id !== store.myPlayer?.id ? handlePlayerClick : null}
                isCurrentUserPlayer={p.id === store.myPlayer?.id}
              />
            ))}
          </div>

          {areaDecorations.filter(d => d.layer === 1).map(deco => (
            <div
              key={deco.id}
              data-interactive-object={!!(deco.is_portal_to || deco.catalog_id)}
              className="absolute"
              style={{
                left: `${deco.x}%`,
                top: `${deco.y}%`,
                width: `${deco.width}%`,
                height: `${deco.height}%`,
                zIndex: 1000,
                cursor: deco.is_portal_to || deco.catalog_id ? 'pointer' : 'default',
                pointerEvents: 'none'
              }}
            >
              <ImageWithFallback src={deco.image_url} className="w-full h-full object-contain" alt="" draggable="false" />
            </div>
          ))}

          {arcadePortals.filter(p => p.areaId === currentAreaKey && p.is_active).map(portal => (
            <div
              key={portal.id}
              data-interactive-object="true"
              className="absolute group cursor-pointer pointer-events-auto"
              style={{
                left: `${portal.position_x}%`,
                top: `${portal.position_y}%`,
                width: `${portal.width}%`,
                height: `${portal.height}%`,
                zIndex: 10,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'auto'
              }}
              onClick={(e) => {
                e.stopPropagation();
                const destinationX = (portal.position_x / 100) * BASE_WIDTH;
                const destinationY = (portal.position_y / 100) * BASE_HEIGHT;
                moveController.setDestination(destinationX, destinationY, () => {
                  navigate(createPageUrl(portal.gameId));
                });
              }}
            >
              <ImageWithFallback src={portal.image_url} className="w-full h-full object-contain pointer-events-none" alt="" draggable="false" />
            </div>
          ))}
        </div>

        <AnimatePresence>
          {isUIVisible && user && isSidePanelOpen && (
            <RightSidePanel
              onClose={() => setIsSidePanelOpen(false)}
              onLogout={handleLogout}
              isLoggingOut={isLoggingOut}
              className="z-40 pointer-events-auto"
            >
              {user && player && (
                <FriendsList
                  isOpen={true}
                  onClose={() => setIsSidePanelOpen(false)}
                  user={user}
                  player={player}
                />
              )}
            </RightSidePanel>
          )}
        </AnimatePresence>

        {isReady && user && isUIVisible && user.admin_level && user.admin_level !== 'user' && (
          <AdminToolbar
            currentUser={user}
            onButtonClick={handleToolbarClick}
            keepAwayMode={keepAwayMode}
            className="z-30 pointer-events-auto"
          />
        )}

        <AnimatePresence>
          {isUIVisible && isReady && user && player && (
            <BottomToolbar
              currentUser={user}
              player={player}
              buttons={bottomToolbarButtons}
              onButtonClick={handleToolbarClick}
              onMessageSent={handleMessageSent}
              isInvisible={isInvisible}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPlayerCardPopup && selectedPlayerForCard && (
            <PlayerCard
              player={selectedPlayerForCard}
              onClose={() => { setShowPlayerCardPopup(false); setSelectedPlayerForCard(null); }}
              onAddFriend={handleAddFriend}
              onTradeRequest={handleTradeRequest}
              onReport={() => toastManager.info('בקרוב!')}
              onGift={() => {
                setShowGiftWindow(true);
                setGiftTarget(selectedPlayerForCard);
                setShowPlayerCardPopup(false);
              }}
              currentUser={user}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-auto"
            />
          )}

          {showMyStuff && user && playerForMyStuff && (
            <MyStuffPopup
              user={user}
              player={playerForMyStuff}
              onClose={() => setShowMyStuff(false)}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-auto"
            />
          )}
          {showShop && user && player && (
            <ShopPopup
              user={user}
              player={player}
              catalogId={activeShopCatalogId}
              onClose={() => {
                setShowShop(false);
                setActiveShopCatalogId(null);
              }}
              onForceSync={forceSyncUserData}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-auto"
            />
          )}
          {showGiftWindow && user && player && giftTarget && (
            <GiftWindow
              player={{ ...player, coins: user.coins, gems: user.gems }}
              user={user}
              onClose={() => { setShowGiftWindow(false); setGiftTarget(null); }}
              onForceSync={forceSyncUserData}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-auto"
              targetUser={giftTarget}
            />
          )}
          {isTradeWindowOpen && activeTrade && player && user && (
            <TradeWindow
              trade={activeTrade}
              currentUser={user}
              currentPlayer={player}
              onClose={handleCloseTradeWindow}
              onTradeCompleted={forceSyncUserData}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-auto"
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showGameMap && (
            <GameMap
              isOpen={true}
              onClose={() => setShowGameMap(false)}
              onSelectArea={handleChangeArea}
              currentArea={currentAreaKey}
              areas={areas}
              user={user}
              className="absolute inset-0 z-60 pointer-events-auto"
            />
          )}
          {systemMessage && <SystemMessageDisplay message={systemMessage} onClose={handleCloseSystemMessage} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-70 pointer-events-auto" />}
        </AnimatePresence>

        <AnimatePresence>
          {tradeRequest && (
            <TradeRequestToast
              request={tradeRequest}
              onAccept={handleAcceptTrade}
              onDecline={handleDeclineTrade}
              className="fixed top-5 left-1/2 -translate-x-1/2 z-80 pointer-events-auto"
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {pendingOutboundTrade && (
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="fixed top-5 left-1/2 -translate-x-1/2 bg-gradient-to-b from-blue-500 to-blue-600 text-white p-2 rounded-lg shadow-lg flex items-center gap-3 z-80 border-2 border-blue-400 pointer-events-auto"
            >
              <ArrowRightLeft className="w-5 h-5 text-yellow-300" />
              <span className="font-bold">בקשת החלפה נשלחה אל {pendingOutboundTrade.receiver_username}...</span>
              <button onClick={async () => {
                try {
                  await Trade.update(pendingOutboundTrade.id, { status: 'cancelled' });
                  socketManager.sendTradeUpdate(pendingOutboundTrade.id, 'cancelled');
                } catch (e) {
                  console.error("Error cancelling pending trade:", e);
                  toastManager.error("שגיאה בביטול ההחלפה.");
                } finally {
                  setPendingOutboundTrade(null);
                }
              }} className="bg-orange-500 hover:bg-orange-600 rounded-md p-1.5">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isTransitioning && (
            <AreaTransitionScreen
              areaName={areas.find(a => a.area_id === targetArea)?.area_name || '...'}
              onAnimationComplete={() => setIsTransitioning(false)}
              className="absolute inset-0 z-[9999] pointer-events-auto"
            />
          )}
          {showSubscriptionGrant && user && (
            <SubscriptionGrantPopup user={user} onClose={() => setShowSubscriptionGrant(false)} />
          )}
          {showAreaSubscriptionPopup && lockedAreaDetails && (
            <SubscriptionRequiredPopup
              onClose={() => setShowAreaSubscriptionPopup(false)}
              title={lockedAreaDetails.area_name}
              message={`הכניסה לאזור '${lockedAreaDetails.area_name}' מיועדת למנויים בלבד. שדרג כדי לפתוח את כל האזורים!`}
              imageUrl={lockedAreaDetails.background_image}
            />
          )}
        </AnimatePresence>

      </div>
    </TooltipProvider>
  );
}
