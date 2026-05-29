## ADDED Requirements

### Requirement: Sidebar hidden by default on mobile viewports
On viewports narrower than 768 px, the sidebar SHALL be hidden (translated off-screen to the left) by default. The main content SHALL fill the full viewport width.

#### Scenario: Mobile viewport initial state
- **WHEN** the page loads on a viewport < 768 px wide
- **THEN** the sidebar is not visible and the page content fills the full width

#### Scenario: Desktop viewport unchanged
- **WHEN** the page loads on a viewport ≥ 768 px wide
- **THEN** the sidebar is visible at 240 px and the layout is identical to the current desktop layout

### Requirement: Hamburger icon opens the sidebar drawer
`AppTopBar` SHALL display a hamburger icon (`☰`) on the left side of the header on viewports < 768 px. Tapping it SHALL open the sidebar as a slide-in drawer. The icon SHALL be hidden on desktop viewports.

#### Scenario: Hamburger tap opens drawer
- **WHEN** user taps the hamburger icon on a mobile viewport
- **THEN** the sidebar slides in from the left with a 250 ms transition and a semi-transparent overlay covers the main content

#### Scenario: Hamburger hidden on desktop
- **WHEN** the viewport is ≥ 768 px wide
- **THEN** the hamburger icon is not rendered

### Requirement: Drawer closes via overlay tap or close button
The open drawer SHALL be closable by tapping the overlay backdrop OR tapping a ✕ close button inside the sidebar. Either action SHALL slide the sidebar back off-screen.

#### Scenario: Tap overlay to close
- **WHEN** the drawer is open and user taps the backdrop overlay
- **THEN** the drawer slides closed and the overlay is removed

#### Scenario: Tap close button inside sidebar
- **WHEN** the drawer is open and user taps the ✕ button inside the sidebar
- **THEN** the drawer slides closed

#### Scenario: Navigation closes drawer
- **WHEN** user taps a nav link inside the open drawer on mobile
- **THEN** the drawer closes after navigation (NuxtLink navigation triggers route change, sidebar watches route to close)

### Requirement: Page content padding reduced on mobile
All main page containers SHALL use `padding: 16px` on viewports < 768 px instead of the desktop `padding: 28px 32px`. This SHALL be achieved via a `--page-pad` CSS custom property defined globally.

#### Scenario: Mobile padding applied
- **WHEN** a page is viewed on a viewport < 768 px
- **THEN** the page container has 16 px padding on all sides

#### Scenario: Desktop padding unchanged
- **WHEN** a page is viewed on a viewport ≥ 768 px
- **THEN** the page container has 28 px top/bottom and 32 px left/right padding

### Requirement: Tables scrollable horizontally on mobile
All data table wrapper elements SHALL allow horizontal scrolling on mobile. Touch momentum scrolling SHALL be enabled for iOS Safari.

#### Scenario: Table wider than viewport
- **WHEN** a table's content is wider than the mobile viewport
- **THEN** the user can scroll the table horizontally without the surrounding page layout breaking
