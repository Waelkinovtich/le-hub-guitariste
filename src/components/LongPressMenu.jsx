import { useLongPressAction } from '../hooks/useLongPressAction'

/**
 * Valeur affichée telle quelle (numéro, email…) ; un appui long (voir
 * useLongPressAction) ouvre un petit menu d'actions ancré juste en dessous.
 * Un tap/clic simple ne déclenche rien — évite tout appel ou email envoyé
 * par accident. Composant de présentation partagé par PhoneActions et
 * EmailActions : eux seuls connaissent le format des liens (tel:/sms:/mailto:).
 */
export default function LongPressMenu({ label, title, actions }) {
  const { open, close, triggerProps } = useLongPressAction()

  return (
    <span className="relative inline-block">
      <span {...triggerProps} className="cursor-default select-none" title={title}>
        {label}
      </span>
      {open && (
        <>
          {/* Fond invisible plein écran : ferme le menu au clic/tap ailleurs,
              sans dépendance externe de type "click outside". */}
          <button type="button" aria-hidden="true" tabIndex={-1} onClick={close} className="fixed inset-0 z-40 cursor-default" />
          <span className="absolute z-50 top-full left-0 mt-1 flex flex-col rounded-lg border border-border-subtle bg-surface-raised shadow-lg overflow-hidden whitespace-nowrap">
            {actions.map(({ href, label: actionLabel, icon: Icon }, i) => (
              <a
                key={href}
                href={href}
                onClick={close}
                className={`flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-surface-overlay transition-colors ${i > 0 ? 'border-t border-border-subtle' : ''}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {actionLabel}
              </a>
            ))}
          </span>
        </>
      )}
    </span>
  )
}
