import streamDeck from "@elgato/streamdeck";
import { BackAction } from "./actions/back";
import { OpenPanelAction } from "./actions/open-panel";
import { PageNavAction } from "./actions/page-nav";
import { SessionSlotAction } from "./actions/session-slot";

streamDeck.actions.registerAction(new OpenPanelAction());
streamDeck.actions.registerAction(new BackAction());
streamDeck.actions.registerAction(new SessionSlotAction());
streamDeck.actions.registerAction(new PageNavAction());

streamDeck.connect();

streamDeck.logger.info("AIDeck started.");
