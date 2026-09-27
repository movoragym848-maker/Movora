package com.movora.gym;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(android.os.Bundle savedInstanceState) {
		registerPlugin(CallAudioPlugin.class);
		super.onCreate(savedInstanceState);
	}
}
