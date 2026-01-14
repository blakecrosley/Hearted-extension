# iOS Project Rules

## Stack Overview
- **Target**: iOS 26+ (Swift 6.2)
- **UI**: SwiftUI with Liquid Glass design
- **Data**: SwiftData for persistence
- **State**: @Observable macro (NOT ObservableObject)
- **Navigation**: NavigationStack (NOT NavigationView)

## Critical Patterns

### State Management
```swift
// CORRECT: @Observable macro
@Observable
class UserViewModel {
    var user: User?
    var isLoading = false
}

// WRONG: Never use ObservableObject
class UserViewModel: ObservableObject { } // DEPRECATED
```

### Navigation
```swift
// CORRECT: NavigationStack
NavigationStack {
    List(items) { item in
        NavigationLink(value: item) {
            ItemRow(item: item)
        }
    }
    .navigationDestination(for: Item.self) { item in
        ItemDetail(item: item)
    }
}

// WRONG: Never use NavigationView
NavigationView { } // DEPRECATED
```

### Liquid Glass (iOS 26)
```swift
// Use glass effects for modern UI
.glassEffect()
.glassEffect(.regular.interactive())

// Material backgrounds
.background(.ultraThinMaterial)
.background(.regularMaterial)
```

### SwiftData
```swift
@Model
class Item {
    var name: String
    var createdAt: Date

    init(name: String) {
        self.name = name
        self.createdAt = .now
    }
}
```

## Project Structure
```
App/
├── App.swift              # @main entry point
├── Models/                # SwiftData models
├── Views/                 # SwiftUI views
├── ViewModels/            # @Observable classes
├── Services/              # API, storage, etc.
└── Utilities/             # Extensions, helpers

Resources/
├── Assets.xcassets        # Images, colors
└── Localizable.strings    # Translations
```

## Code Standards

### View Organization
```swift
struct ContentView: View {
    // 1. Properties
    @Environment(\.modelContext) private var context
    @State private var searchText = ""

    // 2. Body
    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Items")
                .toolbar { toolbarContent }
        }
    }

    // 3. Subviews
    private var content: some View { ... }

    // 4. Toolbar
    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent { ... }
}
```

### Modifier Order
1. Layout (frame, padding)
2. Appearance (foregroundStyle, background)
3. Effects (shadow, blur)
4. Interactions (onTapGesture, gesture)
5. Navigation (navigationDestination)
6. Environment (environment, modelContainer)

## Testing
- XCTest for unit tests
- `@MainActor` for UI tests
- Test ViewModels independently
- Mock services for isolation

## Security
- Keychain for sensitive data (see ~/.claude/rules/ios-security.md)
- Face ID/Touch ID for authentication
- Data Protection on files
- Privacy manifest required (iOS 17+)

## Common Patterns
```swift
// Async loading
Task { @MainActor in
    isLoading = true
    defer { isLoading = false }
    items = try await service.fetchItems()
}

// Error handling
do {
    try await save()
} catch {
    errorMessage = error.localizedDescription
    showError = true
}
```
