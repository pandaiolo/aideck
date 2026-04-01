import streamDeck from "@elgato/streamdeck";
import { BackAction } from "./actions/back";
import { OpenPanelAction } from "./actions/open-panel";
import { PageNavAction } from "./actions/page-nav";
import { SessionSlotAction } from "./actions/session-slot";
import { getHookStatus, installHooks, removeHooks } from "./hook-installer";

streamDeck.actions.registerAction(new OpenPanelAction());
streamDeck.actions.registerAction(new BackAction());
streamDeck.actions.registerAction(new SessionSlotAction());
streamDeck.actions.registerAction(new PageNavAction());

// Auto-install hooks (idempotent, safe on every startup)
const hookResult = installHooks();
if (hookResult.error) {
	streamDeck.logger.error(`Hook install failed: ${hookResult.error}`);
}

// Handle property inspector messages for hook management
streamDeck.ui.onSendToPlugin((ev) => {
	const payload = ev.payload as { command?: string };
	if (payload.command === "getHookStatus") {
		streamDeck.ui.sendToPropertyInspector({ hookStatus: getHookStatus() });
	} else if (payload.command === "installHooks") {
		installHooks();
		streamDeck.ui.sendToPropertyInspector({ hookStatus: getHookStatus() });
	} else if (payload.command === "removeHooks") {
		removeHooks();
		streamDeck.ui.sendToPropertyInspector({ hookStatus: getHookStatus() });
	}
});

streamDeck.connect();

streamDeck.logger.info("AIDeck started.");
