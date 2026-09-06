import { useOptionalShellMode, WelcomeScreen, type WelcomeScreenProps } from '@truefoundry/trueforge-ui';

/**
 * WelcomeScreen override: displays official SAI logo,
 * and the clean "How can I help you today?" prompt.
 * New Agent empty state gets the polka-dot canvas styling.
 */
export function NewAgentWelcomeScreen(props: WelcomeScreenProps) {
  const shell = useOptionalShellMode();
  const isNewAgent =
    shell?.mode.status === 'active' &&
    shell.mode.isMutable &&
    shell.mode.isCreateAgent &&
    !(shell.mode.agentName != null && shell.mode.agentName.length > 0);

  const className = [isNewAgent ? 'new-agent-welcome' : undefined, props.className].filter(Boolean).join(' ');

  return (
    <WelcomeScreen
      {...props}
      heading={props.heading ?? 'How can I help you today?'}
      icon={
        <img
          src="/sai-logo.png"
          alt="SAI Logo"
          className="h-28 w-28 object-contain mx-auto mb-6 drop-shadow-md rounded-lg"
        />
      }
      {...(className ? { className } : {})}
    />
  );
}
