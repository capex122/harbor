import { ChevronDown, ChevronUp, Lock } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { HarborMark } from "@/components/icons/harbor-mark";
import { ProfileChip } from "@/chrome/sidebar/profile-chip";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useHarborLogo } from "@/lib/harbor-logo";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useParental, type LockableTab } from "@/lib/parental";
import { useActiveKid } from "@/lib/profiles";
import { useView, type View } from "@/lib/view";
import { KidsSidebarDoodles } from "./kids-sidebar-doodles";
import { CollapseToggle } from "@/chrome/sidebar/collapse-toggle";
import { NAV_ITEMS, applyNavCustomization, type NavItem, type NavItemId } from "@/chrome/nav-items";

const PRIMARY_IDS = new Set(["home", "discover", "catalogs", "movies", "shows", "kids", "anime", "live", "vod"]);

export function Sidebar() {
  const { view, setView, chromeHidden } = useView();
  const { locked, unlock, hiddenTabs } = useParental();
  const { settings } = useSettings();
  const kid = useActiveKid();
  const t = useT();
  const [pendingPinView, setPendingPinView] = useState<View | null>(null);

  const { mark: customMark, wordmark: customWordmark } = useHarborLogo();
  const collapsed = settings.sidebarCollapsed;
  const hybridBar =
    typeof window !== "undefined" &&
    "__TAURI_INTERNALS__" in window &&
    !settings.useNativeTitleBar &&
    settings.hybridTitleBar;

  return (
    <>
      <aside
        aria-hidden={chromeHidden}
        data-harbor-sidebar
        className={`relative z-[60] hidden w-[72px] shrink-0 flex-col border-e border-edge-soft bg-canvas transition-[opacity,transform,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:flex ${
          collapsed ? "" : "lg:w-60"
        } ${
          chromeHidden
            ? "pointer-events-none -translate-x-2 rtl:translate-x-2 opacity-0"
            : "translate-x-0 opacity-100"
        }`}
      >
        {kid && <KidsSidebarDoodles />}
        <div
          data-tauri-drag-region
          className={`flex shrink-0 items-center justify-center gap-0.5 px-2 text-ink sm:px-3 ${
            collapsed ? "" : "lg:justify-start lg:px-7"
          } ${hybridBar ? "h-12" : "h-20"}`}
        >
          {!hybridBar &&
            (customMark ? (
              <img
                src={customMark}
                alt=""
                draggable={false}
                className={`h-9 w-9 shrink-0 object-contain ${collapsed ? "" : "lg:h-10 lg:w-10"}`}
              />
            ) : (
              <HarborMark className={`h-9 w-9 shrink-0 ${collapsed ? "" : "lg:h-10 lg:w-10"}`} />
            ))}
          {!hybridBar && !collapsed &&
            (customWordmark ? (
              <img
                src={customWordmark}
                alt=""
                draggable={false}
                className="hidden h-8 w-auto object-contain lg:inline-block"
              />
            ) : kid ? (
              <span
                className="hidden whitespace-nowrap text-[42px] font-bold leading-none tracking-tight lg:inline-flex lg:items-center"
                style={{
                  fontFamily: '"Fredoka", "Baloo 2", system-ui, sans-serif',
                  transform: "translateY(1px)",
                }}
              >
                Harb
                <img
                  src="/kids/wheel.png"
                  alt="o"
                  draggable={false}
                  className="inline-block h-[0.92em] w-auto"
                  style={{ transform: "translateY(0.08em)", marginLeft: "-5px", marginRight: "-5px" }}
                />
                r
              </span>
            ) : (
              <span
                className="hidden whitespace-nowrap text-[44px] font-medium leading-none tracking-tight lg:inline"
                style={{
                  fontFamily: '"Fraunces", "Iowan Old Style", "Georgia", serif',
                  transform: "translateY(2px)",
                }}
              >
                Harb
                <span
                  className="inline-block"
                  style={{ transform: "rotate(7deg)", transformOrigin: "50% 65%" }}
                >
                  o
                </span>
                r
              </span>
            ))}
        </div>
        <ScrollableNav
          view={view}
          setView={setView}
          locked={locked}
          collapsed={collapsed}
          hiddenTabs={hiddenTabs}
          onPinNav={(v) => setPendingPinView(v)}
        />
        <div className={`relative p-1.5 sm:p-2 ${collapsed ? "" : "lg:p-4"}`}>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-edge-soft/55 to-transparent ${
              collapsed ? "" : "lg:inset-x-4"
            }`}
          />
          <div className={`flex pb-1 ${collapsed ? "justify-center" : ""}`}>
            <CollapseToggle collapsed={collapsed} />
          </div>
          {locked ? (
            <div
              className={`flex w-full items-center justify-center gap-3 rounded-xl py-2.5 ${
                collapsed ? "" : "lg:justify-start lg:px-3"
              }`}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-edge-soft bg-elevated/50 text-ink-subtle">
                <Lock size={17} />
              </div>
              {!collapsed && (
                <div className="hidden min-w-0 flex-1 lg:block">
                  <div className="truncate text-[13.5px] font-medium text-ink-muted">{t("chrome.locked")}</div>
                  <div className="truncate text-[12px] text-ink-subtle">{t("chrome.parentalOn")}</div>
                </div>
              )}
            </div>
          ) : (
            <ProfileChip collapsed={collapsed} />
          )}
        </div>
      </aside>
      <MobileNav
        view={view}
        setView={setView}
        locked={locked}
        hiddenTabs={hiddenTabs}
        hidden={chromeHidden}
        onPinNav={setPendingPinView}
      />
      {pendingPinView && (
        <ParentalPinModal
          mode={{
            kind: "unlock",
            onUnlock: () => {
              const v = pendingPinView;
              setPendingPinView(null);
              if (v) setView(v);
            },
            onCancel: () => setPendingPinView(null),
          }}
          verify={unlock}
        />
      )}
    </>
  );
}

const MOBILE_NAV: Array<{ id: NavItemId; label?: string; menu?: NavItemId[] }> = [
  { id: "discover", menu: ["movies", "shows"] },
  { id: "live", menu: ["catalogs", "collections"] },
  { id: "home" },
  { id: "manga", menu: ["anime"] },
  { id: "library", label: "Library", menu: ["calendar", "addons", "settings"] },
];

function MobileNav({
  view,
  setView,
  locked,
  hiddenTabs,
  hidden,
  onPinNav,
}: {
  view: View;
  setView: (view: View) => void;
  locked: boolean;
  hiddenTabs: Record<LockableTab, boolean>;
  hidden: boolean;
  onPinNav: (view: View) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState<NavItemId | null>(null);
  const timer = useRef<number | null>(null);
  const held = useRef(false);
  const item = (id: NavItemId) => NAV_ITEMS.find((it) => it.id === id)!;
  const activeGroup = (id: NavItemId) => {
    const nav = MOBILE_NAV.find((it) => it.id === id)!;
    return [id, ...(nav.menu ?? [])].some((key) => item(key).view === view);
  };
  const go = (id: NavItemId) => {
    const target = item(id);
    setOpen(null);
    if (target.pinGated && locked) onPinNav(target.view);
    else setView(target.view);
  };
  const press = (id: NavItemId, hasMenu: boolean) => {
    held.current = false;
    if (!hasMenu) return;
    timer.current = window.setTimeout(() => {
      held.current = true;
      setOpen(id);
    }, 450);
  };
  const release = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <nav
      aria-label={t("Navigation")}
      className={`fixed z-[70] mx-auto flex h-16 max-w-[560px] items-start rounded-[24px] border border-white/20 bg-surface/45 px-2 pt-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-[28px] backdrop-saturate-150 transition-transform lg:hidden ${hidden ? "translate-y-[calc(100%+1rem)]" : "translate-y-0"}`}
      style={{
        bottom: "max(var(--harbor-safe-bottom), 0.5rem)",
        left: "max(env(safe-area-inset-left, 0px), 0.75rem)",
        right: "max(env(safe-area-inset-right, 0px), 0.75rem)",
      }}
    >
      {open && <button aria-label={t("Close")} className="fixed inset-0 -z-10" onClick={() => setOpen(null)} />}
      {MOBILE_NAV.map((nav, index) => {
        const current = item(nav.id);
        const active = activeGroup(nav.id);
        const isHome = nav.id === "home";
        const menu = nav.menu?.filter((id) => {
          const option = item(id);
          return !(locked && option.parentalKey && hiddenTabs[option.parentalKey]);
        });
        return (
          <div key={nav.id} className="relative flex min-w-0 flex-1 justify-center">
            {open === nav.id && menu && (
              <div
                className={`absolute bottom-[calc(100%+14px)] flex min-w-36 flex-col gap-1 rounded-2xl border border-edge bg-elevated/95 p-1.5 shadow-[0_18px_46px_rgba(0,0,0,0.55)] backdrop-blur-xl ${index === 0 ? "start-0" : index === MOBILE_NAV.length - 1 ? "end-0" : "start-1/2 -translate-x-1/2"}`}
              >
                {menu.map((id) => {
                  const option = item(id);
                  const selected = option.view === view;
                  return (
                    <button
                      key={id}
                      onClick={() => go(id)}
                      className={`flex h-11 items-center gap-3 rounded-xl px-3 text-start text-[13px] font-semibold transition-colors ${selected ? "bg-raised text-ink" : "text-ink-muted hover:bg-raised/70 hover:text-ink"}`}
                    >
                      <span className="shrink-0">{option.render(selected)}</span>
                      {t(option.label)}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              onPointerDown={() => press(nav.id, !!menu?.length)}
              onPointerUp={release}
              onPointerCancel={release}
              onPointerLeave={(event: ReactPointerEvent<HTMLButtonElement>) => {
                if (event.pointerType === "mouse") release();
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                if (menu?.length) setOpen(nav.id);
              }}
              onClick={() => {
                if (held.current) {
                  held.current = false;
                  return;
                }
                go(nav.id);
              }}
              aria-label={t(nav.label ?? current.label)}
              aria-haspopup={menu?.length ? "menu" : undefined}
              aria-expanded={open === nav.id || undefined}
              className={`flex min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-all active:scale-95 ${isHome ? "-translate-y-3" : "h-14"} ${active ? "text-accent" : "text-ink-subtle"}`}
            >
              <span className={isHome ? "flex h-14 w-14 items-center justify-center rounded-full bg-ink text-canvas shadow-[0_8px_24px_rgba(0,0,0,0.38)]" : "flex h-8 items-center justify-center"}>
                {current.render(active)}
              </span>
              {!isHome && <span className="max-w-full truncate">{t(nav.label ?? current.label)}</span>}
            </button>
          </div>
        );
      })}
    </nav>
  );
}

function ScrollableNav({
  view,
  setView,
  locked,
  collapsed,
  hiddenTabs,
  onPinNav,
}: {
  view: View;
  setView: (v: View) => void;
  locked: boolean;
  collapsed: boolean;
  hiddenTabs: Record<LockableTab, boolean>;
  onPinNav: (v: View) => void;
}) {
  const { settings } = useSettings();
  const kid = useActiveKid();
  const t = useT();
  const items = applyNavCustomization(NAV_ITEMS, settings.navCustomization);
  const isItemVisible = (item: NavItem) => {
    if (kid) return item.view === "kids";
    if (item.view === "kids") return false;
    if (item.view === "vod" && !settings.showPlaylistsTab) return false;
    if (item.hideKey && settings.hideContent[item.hideKey]) return false;
    if (locked && item.parentalKey && hiddenTabs[item.parentalKey]) return false;
    return true;
  };
  const visible = items.filter(isItemVisible);
  const primary = visible.filter((item) => PRIMARY_IDS.has(item.id));
  const collections = visible.filter((item) => !PRIMARY_IDS.has(item.id));
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<{ top: boolean; bottom: boolean }>({
    top: false,
    bottom: false,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const top = el.scrollTop > 4;
      const bottom = el.scrollHeight - el.scrollTop - el.clientHeight > 4;
      setOverflow((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const scrollDown = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ top: 112, behavior: "smooth" });
  };

  const scrollToTop = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        className="flex flex-1 flex-col overflow-y-auto px-2 pt-3 pb-6 sm:px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex flex-col gap-1.5">
          {primary.map((item) => (
            <NavItem
              key={item.id}
              {...item}
              collapsed={collapsed}
              big={!!kid}
              active={view === item.view}
              onClick={() => setView(item.view)}
            />
          ))}
          {kid && (
            <NavItem
              render={(active) => <KidsPlayIcon active={active} />}
              label="Play"
              big
              collapsed={collapsed}
              active={false}
              onClick={() => {
                setView("kids");
                window.dispatchEvent(new CustomEvent("harbor:kids-play"));
              }}
            />
          )}
        </div>
        <div data-tauri-drag-region className="py-2.5">
          <div className="mx-3 h-px bg-gradient-to-r from-transparent via-edge-soft/55 to-transparent" />
        </div>
        <div className="flex flex-col gap-1.5">
          {collections.map((item) => {
            const gated = !!item.pinGated && locked;
            return (
              <NavItem
                key={item.id}
                {...item}
                gated={gated}
                collapsed={collapsed}
                active={view === item.view}
                onClick={() => (gated ? onPinNav(item.view) : setView(item.view))}
              />
            );
          })}
        </div>
        <div data-tauri-drag-region className="flex-1 min-h-2" />
      </div>
      {overflow.top && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-canvas via-canvas/85 to-transparent" />
          <button
            type="button"
            onClick={scrollToTop}
            aria-label={t("chrome.backToTop")}
            data-tv-skip=""
            className="absolute top-1 left-1/2 flex h-4 w-7 -translate-x-1/2 items-center justify-center text-ink-subtle/55 transition-colors hover:text-ink-muted"
          >
            <ChevronUp size={11} strokeWidth={2} />
          </button>
        </>
      )}
      {overflow.bottom && (
        <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-canvas via-canvas/85 to-transparent" />
          <button
            type="button"
            onClick={scrollDown}
            aria-label={t("chrome.scrollForMore")}
            data-tv-skip=""
            className="absolute bottom-1 left-1/2 flex h-4 w-7 -translate-x-1/2 items-center justify-center text-ink-subtle/55 transition-colors hover:text-ink-muted"
          >
            <ChevronDown size={11} strokeWidth={2} />
          </button>
        </>
      )}
    </div>
  );
}

function KidsPlayIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={active ? "" : "opacity-70"}
    >
      <circle cx="12" cy="14" r="9" />
      <path d="M10 10.5 L16.5 14 L10 17.5 Z" fill="currentColor" stroke="none" />
      <circle cx="21.5" cy="6" r="1.7" />
      <circle cx="24" cy="10.5" r="1" />
    </svg>
  );
}

function NavItem({
  render,
  label,
  active,
  onClick,
  gated,
  collapsed,
  big,
  view,
}: {
  render: (active: boolean) => ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  gated?: boolean;
  collapsed?: boolean;
  big?: boolean;
  view?: View;
}) {
  const t = useT();
  const text = t(label);
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-harbor-nav={view}
      data-active={active ? "" : undefined}
      aria-label={gated ? t("chrome.lockedRequiresPin", { label: text }) : text}
      title={gated ? t("chrome.lockedShort", { label: text }) : text}
      className={`relative flex items-center justify-center gap-4 transition-colors duration-150 ${
        big ? "h-[68px] rounded-2xl text-[20px] font-bold" : "h-14 rounded-xl text-[16px]"
      } ${collapsed ? "" : big ? "lg:justify-start lg:px-5" : "lg:justify-start lg:px-4"} ${
        collapsed
          ? active
            ? "text-accent"
            : "text-ink-muted hover:text-ink"
          : active
            ? "bg-elevated text-ink"
            : "text-ink-muted hover:bg-elevated/50 hover:text-ink"
      }`}
    >
      <span className={`relative ${big ? "scale-110" : ""} ${gated ? "opacity-70" : ""}`}>
        {render(hovered)}
        {gated && (
          <span className="absolute -bottom-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-canvas text-ink-subtle ring-1 ring-edge">
            <Lock size={9} strokeWidth={2.4} />
          </span>
        )}
      </span>
      {!collapsed && <span className="hidden lg:inline">{text}</span>}
    </button>
  );
}

