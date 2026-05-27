import { m } from '#/paraglide/messages'
import { getLocale, locales, setLocale } from '#/paraglide/runtime'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type LocaleSwitcherProps = {
	className?: string
	compact?: boolean
}

export default function ParaglideLocaleSwitcher({
	className,
	compact = false,
}: LocaleSwitcherProps) {
	const currentLocale = getLocale()

	return (
		<section
			className={cn(
				compact ? 'flex items-center gap-2' : 'flex flex-col gap-3 sm:items-start',
				className
			)}
			aria-label={m.language_label()}
		>
			{!compact && (
				<Badge variant="outline" className="w-fit border-border/60 bg-background/70">
					{m.current_locale({ locale: currentLocale.toUpperCase() })}
				</Badge>
			)}
			<div className="flex flex-wrap gap-2">
				{locales.map((locale) => (
					<Button
						key={locale}
						variant={locale === currentLocale ? 'default' : 'outline'}
						size="sm"
						onClick={() => setLocale(locale)}
						aria-pressed={locale === currentLocale}
						className={cn('min-w-14', compact && 'min-w-12')}
					>
						{locale.toUpperCase()}
					</Button>
				))}
			</div>
		</section>
	)
}
