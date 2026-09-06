import { getErrorMessage, ThemeProvider, TrueForgeUI, type SlotOverrides } from '@truefoundry/trueforge-ui';
import {
  createTrueForgeClient,
  getCapabilities,
  listModels,
  type HarnessAgentSpec,
} from '@truefoundry/trueforge-ui/plugins/trueforge-agent-server-adapter';
import { useEffect, useMemo, useState } from 'react';
import { AuthErrorScreen } from './AuthErrorScreen';
import { createAuthAwareFetch } from './authFetch';
import { probeSession, type SessionState } from './authSession';
import { parseAuthErrorReason, shouldShowAuthErrorScreen, stripAuthErrorSearch } from './authStatusSearch';
import { GetStartedScreen } from './GetStartedScreen';
import { LogoutButton } from './LogoutButton';
import { NewAgentWelcomeScreen } from './NewAgentWelcomeScreen';
import { API_BASE_URL, uiRouterBasename } from './publicPath';

/** Shared cookie/OIDC fetch for boot helpers and `<TrueForgeUI server />`. */
const authAwareFetch = createAuthAwareFetch();
// UI + API share `VITE_BASE_PATH` / `BASE_URL`; Caddy strips it before Harness.
const bootClient = createTrueForgeClient({ baseUrl: API_BASE_URL, fetch: authAwareFetch });
const routerBasename = uiRouterBasename();

type BootState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; defaultAgentSpec: HarnessAgentSpec; openSettings: boolean };

function SaiBrandLogo({ className, variant = 'icon' }: { className?: string; variant?: 'icon' | 'logo' }) {
  if (variant === 'logo') {
    return (
      <span
        className={`font-bold tracking-tight text-base text-text-primary select-none px-1 inline-flex items-center gap-2.5 ${className ?? ''}`}
      >
        <div className="flex size-9 items-center justify-center rounded-xl bg-[#1a1a1e] border border-[#2e2e38] shadow-sm shrink-0 overflow-hidden">
          <img src="/sai-logo.png" alt="SAI Logo" className="h-7 w-7 object-contain rounded" />
        </div>
        <span>SAI: Sovereign Agentic Workbench</span>
      </span>
    );
  }
  return (
    <div
      className="flex size-9 items-center justify-center rounded-xl bg-[#1a1a1e] border border-[#2e2e38] shadow-sm select-none hover:border-[#45b7b8]/60 transition-colors overflow-hidden"
      title="SAI: Sovereign Agentic Workbench"
    >
      <img src="/sai-logo.png" alt="SAI Logo" className="h-7 w-7 object-contain rounded" />
    </div>
  );
}

export function App() {
  const authError = parseAuthErrorReason(window.location.search);
  const [session, setSession] = useState<SessionState | 'checking'>('checking');
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });

  // Gate boot on a non-redirecting `/me` probe: unauthenticated users see the
  // welcome screen instead of being bounced to login by the auth-aware fetch.
  // Probe even when the URL has `?error=` — a replayed callback can leave that
  // query on a session that is still valid.
  useEffect(() => {
    const state = { cancelled: false };
    void probeSession().then(result => {
      if (!state.cancelled) {
        setSession(result);
      }
    });
    return () => {
      state.cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (session !== 'authenticated') {
      return;
    }
    if (parseAuthErrorReason(window.location.search) == null) {
      return;
    }
    window.history.replaceState(
      window.history.state,
      '',
      stripAuthErrorSearch({
        search: window.location.search,
        pathname: window.location.pathname,
        hash: window.location.hash,
      }),
    );
  }, [session]);

  useEffect(() => {
    if (session !== 'authenticated') {
      return;
    }

    const state = { cancelled: false };
    void (async () => {
      try {
        const [models, capabilities] = await Promise.all([listModels(bootClient), getCapabilities(bootClient)]);
        if (state.cancelled) {
          return;
        }

        const defaultInstructions = `You are SAI (Sovereign Agentic Infrastructure), an air-gapped refinery copilot.
CRITICAL OPERATIONAL RULES:
- NEVER calculate fluid mechanics, velocity, or pressure drops using mental arithmetic. Always invoke \`execute_engineering_calc\`.
- NEVER output raw JSON tool mockups or strings like \`{"name": ...}\` in chat text. Invoke tools natively via API tool calls.
- NEVER output mock document templates in markdown when an MOC or report is requested. Always invoke \`generate_sai_approval_note\` with file_format='docx' to persist the document to ~/sai-output/.
- When an operational issue is described, sequentially call \`execute_engineering_calc\` first, then call \`generate_sai_approval_note\` with the calculated results.`;
        const defaultAgentConfig = {
          sandbox: { enabled: capabilities.sandbox.enabled },
          generative_ui: { enabled: false },
        };
        const defaultMcpServers = [{ name: 'sai-refinery-tools', preload: true }];
        const first = models[0];
        if (first === undefined) {
          setBoot({
            status: 'ready',
            openSettings: true,
            defaultAgentSpec: {
              model: { name: '' },
              instructions: defaultInstructions,
              mcpServers: defaultMcpServers,
              config: defaultAgentConfig,
            },
          });
          return;
        }
        const reasoningEfforts = first.properties.reasoningEfforts;
        // Default to the lowest real effort, not "none" — catalog lists are ordered ascending.
        const defaultReasoningEffort = reasoningEfforts?.find(effort => effort !== 'none') ?? reasoningEfforts?.[0];

        setBoot({
          status: 'ready',
          openSettings: false,
          defaultAgentSpec: {
            model: {
              name: first.name,
              ...(defaultReasoningEffort ? { params: { reasoningEffort: defaultReasoningEffort } } : {}),
            },
            instructions: defaultInstructions,
            mcpServers: defaultMcpServers,
            config: defaultAgentConfig,
          },
        });
      } catch (err) {
        if (!state.cancelled) {
          setBoot({
            status: 'error',
            message: getErrorMessage(err, 'Failed to boot'),
          });
        }
      }
    })();
    return () => {
      state.cancelled = true;
    };
  }, [session]);

  const overrides: SlotOverrides = useMemo(
    () => ({
      ShellActionsActionSlot: LogoutButton,
      WelcomeScreen: NewAgentWelcomeScreen,
      BrandLogo: SaiBrandLogo,
    }),
    [],
  );

  const authErrorReason = shouldShowAuthErrorScreen({ authError, session });
  if (authErrorReason != null) {
    return (
      <ThemeProvider>
        <AuthErrorScreen reason={authErrorReason} />
      </ThemeProvider>
    );
  }

  if (session === 'checking') {
    return (
      <ThemeProvider>
        <div className="boot-screen">Loading application…</div>
      </ThemeProvider>
    );
  }

  if (session === 'unauthenticated') {
    return (
      <ThemeProvider>
        <GetStartedScreen />
      </ThemeProvider>
    );
  }

  if (boot.status === 'error') {
    return (
      <ThemeProvider>
        <div className="boot-screen" data-error="true">
          Failed to load application configuration: {boot.message}
        </div>
      </ThemeProvider>
    );
  }

  if (boot.status === 'loading') {
    return (
      <ThemeProvider>
        <div className="boot-screen">Loading application…</div>
      </ThemeProvider>
    );
  }

  return (
    <div className="app-root">
      <TrueForgeUI
        server={{ type: 'trueforge', baseUrl: API_BASE_URL, fetch: authAwareFetch }}
        layout="sidebar"
        withRouter
        theme={{
          mode: 'dark',
          brand: {
            mode: 'icon-title',
            name: 'SAI: Sovereign Agentic Workbench',
          },
        }}
        {...(routerBasename ? { routes: { basename: routerBasename } } : {})}
        agentConfig={{
          mode: 'AgentLibraryWithComposer',
          defaultAgentSpec: boot.defaultAgentSpec,
        }}
        initialSettingsOpen={boot.openSettings}
        overrides={overrides}
        className="app-assistant"
      />
    </div>
  );
}
