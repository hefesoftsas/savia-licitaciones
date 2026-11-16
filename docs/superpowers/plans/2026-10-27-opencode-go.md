# OpenCode Go Integration Plan

**Goal:** Support the user's OpenCode Go Muse Contributor model for tender preparation while retaining the existing OpenRouter profile.

**Architecture:** Keep a distinct, fixed endpoint and credential profile for each provider. Add an adapter between the app's chat-completions protocol and the Responses API for ordinary analysis and agent tool calls. Preserve tool-call IDs and order, return the finish reason and usage, and fail explicitly on unsupported content. Do not silently route requests between providers.

**Tasks**

1. Test request conversion, response conversion, tool-call round trips, errors and streaming compatibility without network; implement the adapter.
2. Test provider-profile persistence and switching; add OpenCode settings and a clear Contributor data-use notice without exposing credentials.
3. Connect the adapter to the existing text and agent proxy paths, retaining timeouts, cancellation and queueing; validate integration with mocked upstream responses.
4. Verify with the user's OpenCode key and public sample only, then exercise SECOP analysis, outline, content and Word export in an isolated profile. Review behavior against OpenCode Go's coding-agent usage guidance and report limits.
