import streamDeck, {
	action,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import { sessionManager } from "../session-manager";

@action({ UUID: "com.aideck.aideck.open-panel" })
export class OpenPanelAction extends SingletonAction {
	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		sessionManager.registerPanel(ev.action);
	}

	override async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
		sessionManager.unregisterPanel();
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		sessionManager.refresh();
		await streamDeck.profiles.switchToProfile(
			ev.action.device.id,
			"profiles/aideck-panel",
		);
	}
}
