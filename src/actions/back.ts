import streamDeck, {
	action,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
} from "@elgato/streamdeck";
import { renderBackKey } from "../renderer";

@action({ UUID: "com.aideck.aideck.back" })
export class BackAction extends SingletonAction {
	override async onWillAppear(ev: WillAppearEvent): Promise<void> {
		await ev.action.setImage(renderBackKey());
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		await streamDeck.profiles.switchToProfile(ev.action.device.id);
	}
}
