import {
	IconBrandApple,
	IconBrandSoundcloud,
	IconBrandSpotify,
	IconBrandYoutube,
	IconChevronDown,
	IconExternalLink,
	IconMenu2,
	IconMusic,
	IconPlayerPlay,
} from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ComponentType, ReactNode, SVGProps } from "react";
import {
	type ListenProvider,
	latestSong,
	listenProviderOrder,
} from "@/lib/songs.ts";
import { cn } from "@/lib/utils.ts";
import { m } from "@/paraglide/messages";
import ParaglideLocaleSwitcher from "../LocaleSwitcher";
import { buttonVariants } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Separator } from "../ui/separator";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "../ui/sheet";

type ActionRenderer = (props: {
	key: string;
	href: string;
	className: string;
	ariaLabel?: string;
	children: ReactNode;
}) => ReactNode;

type ProviderConfig = {
	label: () => string;
	Icon: ComponentType<SVGProps<SVGSVGElement>>;
	className: string;
};

function IconBrandYoutubeMusic(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			aria-hidden="true"
			{...props}
		>
			<circle cx="12" cy="12" r="8" />
			<circle cx="12" cy="12" r="4.5" />
			<path
				d="M10.5 9.75v4.5L14.5 12l-4-2.25Z"
				fill="currentColor"
				stroke="none"
			/>
		</svg>
	);
}

const providerConfig: Record<ListenProvider, ProviderConfig> = {
	spotify: {
		label: () => m.home_release_link_spotify(),
		Icon: IconBrandSpotify,
		className:
			"bg-[#1ed760] text-[#03150b] hover:bg-[#34e26f] focus-visible:ring-[#1ed760]/40",
	},
	soundcloud: {
		label: () => m.home_release_link_soundcloud(),
		Icon: IconBrandSoundcloud,
		className:
			"bg-linear-to-r from-[#ff6a00] to-[#ff8f1f] text-white hover:from-[#ff7a1a] hover:to-[#ffa43d] focus-visible:ring-[#ff7a1a]/40",
	},
	youtubeMusic: {
		label: () => m.home_release_link_youtube(),
		Icon: IconBrandYoutubeMusic,
		className:
			"bg-[#f30045] text-white hover:bg-[#ff245f] focus-visible:ring-[#f30045]/40",
	},
	appleMusic: {
		label: () => m.home_release_link_apple_music(),
		Icon: IconBrandApple,
		className:
			"bg-linear-to-r from-[#fa243c] to-[#fb5c74] text-white hover:from-[#ff3d56] hover:to-[#ff7288] focus-visible:ring-[#fb5c74]/40",
	},
	youtube: {
		label: () => m.home_release_link_youtube_video(),
		Icon: IconBrandYoutube,
		className:
			"bg-[#ff0033] text-white hover:bg-[#ff264f] focus-visible:ring-[#ff0033]/40",
	},
};

const renderExternalAction: ActionRenderer = ({
	key,
	href,
	className,
	ariaLabel,
	children,
}) => (
	<a
		key={key}
		href={href}
		target="_blank"
		rel="noreferrer"
		className={className}
		aria-label={ariaLabel}
	>
		{children}
	</a>
);

function LatestSongArtwork() {
	if (latestSong?.artworkUrl) {
		return (
			<img
				src={latestSong.artworkUrl}
				alt={latestSong.title}
				className="size-full object-cover"
				loading="lazy"
			/>
		);
	}

	return (
		<div className="flex size-full flex-col justify-between bg-[radial-gradient(circle_at_20%_20%,rgba(30,215,96,0.45),transparent_48%),linear-gradient(150deg,#151515_0%,#050505_100%)] p-3 text-[#d2ffd7]">
			<span className="inline-flex size-9 items-center justify-center rounded-2xl bg-white/10 text-white">
				<IconMusic className="size-4.5" />
			</span>
			<div className="space-y-1">
				<div className="h-2.5 w-10 rounded-full bg-white/20" />
				<div className="h-2 w-14 rounded-full bg-white/10" />
			</div>
		</div>
	);
}

function ListenNowPanel({
	actionRenderer = renderExternalAction,
}: {
	actionRenderer?: ActionRenderer;
}) {
	const providerLinks = latestSong
		? listenProviderOrder.flatMap((provider) => {
				const href = latestSong.links[provider];

				if (!href) {
					return [];
				}

				return [{ href, provider, ...providerConfig[provider] }];
			})
		: [];

	const featuredHref = latestSong?.links.spotify ?? providerLinks[0]?.href;
	const cardClassName =
		"block rounded-[28px] border border-white/10 bg-[#090909] p-4 text-left text-white shadow-[0_22px_80px_-30px_rgba(0,0,0,0.92)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none";
	const cardContent = (
		<div className="space-y-4">
			<div className="flex items-start gap-4">
				<div className="size-22 shrink-0 overflow-hidden rounded-[1.35rem] ring-1 ring-white/10">
					<LatestSongArtwork />
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2 text-[0.65rem] font-medium uppercase tracking-[0.22em] text-zinc-400">
						<span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-1 text-[0.6rem] tracking-[0.18em] text-[#7dffad]">
							<IconBrandSpotify className="size-3.5" />
							{m.home_release_link_spotify()}
						</span>
						<span>{m.home_header_latest_song_label()}</span>
					</div>

					<p className="mt-3 truncate text-lg font-semibold text-white">
						{latestSong?.title ?? m.home_header_no_song_title()}
					</p>
					<p className="mt-1 truncate text-sm text-zinc-400">
						{latestSong?.artist ?? m.home_header_no_song_description()}
					</p>
					<p className="mt-4 text-xs leading-5 text-zinc-500">
						{latestSong
							? m.home_header_latest_song_description()
							: m.home_header_no_song_description()}
					</p>
				</div>
			</div>

			<div className="flex items-center justify-between rounded-[1.1rem] bg-white/6 px-3 py-2 text-xs text-zinc-300">
				<span>{m.home_header_provider_summary()}</span>
				<span className="inline-flex items-center gap-1 text-white">
					<IconExternalLink className="size-3.5" />
					{providerLinks.length}
				</span>
			</div>
		</div>
	);

	return (
		<div className="flex flex-col gap-3">
			{featuredHref ? (
				actionRenderer({
					key: `featured-${latestSong?.slug ?? "empty"}`,
					href: featuredHref,
					className: cardClassName,
					ariaLabel: latestSong?.title ?? m.home_header_no_song_title(),
					children: cardContent,
				})
			) : (
				<div className={cardClassName}>{cardContent}</div>
			)}

			{providerLinks.length > 0 ? (
				<div className="grid gap-2">
					{providerLinks.map(({ href, provider, label, Icon, className }) =>
						actionRenderer({
							key: `${provider}-${href}`,
							href,
							className: cn(
								buttonVariants({ size: "lg" }),
								"w-full justify-between rounded-[1.2rem] border-0 px-4 shadow-[0_12px_40px_-22px_rgba(0,0,0,0.7)]",
								className,
							),
							ariaLabel: label(),
							children: (
								<>
									<span className="flex items-center gap-3">
										<Icon className="size-4.5" />
										{label()}
									</span>
									<IconExternalLink className="size-4 opacity-80" />
								</>
							),
						}),
					)}
				</div>
			) : (
				<div className="rounded-[1.2rem] border border-dashed border-border/70 bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
					{m.home_header_no_song_description()}
				</div>
			)}
		</div>
	);
}

function ListenNowDropdown({ className }: { className?: string }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				className={cn(
					buttonVariants({ size: "sm" }),
					"rounded-full aria-expanded:bg-primary aria-expanded:text-primary-foreground",
					className,
				)}
			>
				<IconPlayerPlay data-icon="inline-start" />
				{m.home_header_cta()}
				<IconChevronDown data-icon="inline-end" className="size-4 opacity-70" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				sideOffset={12}
				className="w-88 max-w-[calc(100vw-1rem)] min-w-0 overflow-hidden rounded-[30px] border border-white/10 bg-[#050505] p-3 text-white shadow-[0_30px_90px_-34px_rgba(0,0,0,0.92)] ring-white/10"
			>
				<ListenNowPanel />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

const navItems = [
	{ href: "#about", label: () => m.home_nav_about() },
	{ href: "#music", label: () => m.home_nav_music() },
	{ href: "#course", label: () => m.home_nav_course() },
	{ href: "#contact", label: () => m.home_nav_contact() },
] as const;

function scrollToHash(hash: string) {
	if (typeof document === "undefined") {
		return;
	}

	const target = document.querySelector(hash);

	if (target instanceof HTMLElement) {
		target.scrollIntoView({ behavior: "smooth", block: "start" });
		window.history.replaceState(null, "", hash);
	}
}

export const Header = () => {
	return (
		<header className="sticky top-4 z-40 kcontainer">
			<div className="flex items-center gap-2 rounded-full border border-border/60 bg-background/78 px-4 py-3 shadow-lg shadow-black/10 backdrop-blur-md sm:pl-6">
				<Link to="/" className="min-w-0">
					<span className="block truncate text-sm font-medium sm:text-xl">
						{m.home_eyebrow()}
					</span>
				</Link>

				<Separator
					orientation="vertical"
					className="hidden h-8 md:block ml-3"
				/>

				<nav className="hidden items-center gap-1 md:flex">
					{navItems.map((item) => (
						<a
							key={item.href}
							href={item.href}
							className={cn(
								buttonVariants({ variant: "ghost", size: "sm" }),
								"rounded-full text-muted-foreground hover:text-foreground",
							)}
						>
							{item.label()}
						</a>
					))}
				</nav>

				<div className="ml-auto hidden items-center gap-3 md:flex">
					<ParaglideLocaleSwitcher compact />
					<ListenNowDropdown />
				</div>

				<div className="ml-auto md:hidden">
					<Sheet>
						<SheetTrigger
							render={
								<button
									type="button"
									className={buttonVariants({
										variant: "outline",
										size: "icon-sm",
									})}
								/>
							}
							aria-label={m.home_menu_open_label()}
						>
							<IconMenu2 />
						</SheetTrigger>
						<SheetContent
							side="right"
							className="border-border/60 bg-popover/96"
						>
							<SheetHeader className="border-b border-border/60">
								<SheetTitle>{m.home_eyebrow()}</SheetTitle>
								<SheetDescription>{m.home_header_tagline()}</SheetDescription>
							</SheetHeader>

							<div className="flex flex-col gap-2 p-6">
								<ParaglideLocaleSwitcher className="mb-2" />
								{navItems.map((item) => (
									<SheetClose
										key={item.href}
										onClick={() => scrollToHash(item.href)}
										render={
											<button
												type="button"
												className={cn(
													buttonVariants({ variant: "ghost", size: "lg" }),
													"justify-start",
												)}
											/>
										}
									>
										{item.label()}
									</SheetClose>
								))}
							</div>

							<SheetFooter className="border-t border-border/60">
								<ListenNowPanel
									actionRenderer={({
										key,
										href,
										className,
										ariaLabel,
										children,
									}) => (
										<SheetClose
											key={key}
											render={
												<button
													type="button"
													className={className}
													aria-label={ariaLabel}
													onClick={() =>
														window.open(href, "_blank", "noopener,noreferrer")
													}
												/>
											}
										>
											{children}
										</SheetClose>
									)}
								/>
							</SheetFooter>
						</SheetContent>
					</Sheet>
				</div>
			</div>
		</header>
	);
};
