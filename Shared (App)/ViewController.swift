//
//  ViewController.swift
//  Shared (App)
//
//  Created by Blake Crosley on 1/5/26.
//

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "com.941apps.Hearted.Extension"

class ViewController: PlatformViewController {

    override func viewDidLoad() {
        super.viewDidLoad()

#if os(macOS)
        // Check extension state and open Safari preferences
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                return
            }

            if !state.isEnabled {
                DispatchQueue.main.async {
                    SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier)
                }
            }
        }
#endif
    }
}
