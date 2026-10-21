# Testimonial Carousel / Case Study Slider Spec

## Goal
Build a **16:9 testimonial carousel** for a startup SaaS website. The component should match the wireframe exactly: one **expanded active card** on the left, one **large preview card** on the right, and two **narrow peeking cards** further right. Bottom navigation uses arrows and pagination dots.

---

## Component Name
`TestimonialCarousel`

---

## Layout

### Desktop
- Overall container: **16:9 aspect ratio**
- Horizontal layout with three visible zones:
  1. **Expanded card** (primary, left side)
  2. **Preview card** (secondary, right side)
  3. **Two narrow peek cards** at the far right
- Bottom center navigation:
  - Left arrow
  - Pagination dots
  - Right arrow

### Mobile
- Stack cards vertically or convert to a single-card carousel.
- Hide the narrow peek cards if space is limited.

---

## Card States

### 1) Expanded / Revealed State
This is the active testimonial card.

**Shows:**
- Founder photo
- Founder name
- Role + company
- Main success quote
- 3 metric blocks

**Visual priority:**
- Largest card
- Highest opacity
- Full content visible
- Strongest emphasis

### 2) Closed / Collapsed State
This is any non-active card.

**Shows:**
- Founder photo
- Name
- Role + company
- Short quote preview

**Hidden in this state:**
- Metrics
- Long quote body

**Visual priority:**
- Smaller width
- Lower opacity or reduced contrast
- Slightly muted compared to active card

### 3) Peek State
Used for the two thin cards at the far right.

**Shows:**
- Minimal card shell
- Partial visual cue only
- Enough to suggest more items exist

**Purpose:**
- Reinforces carousel depth
- Matches the wireframe’s layered look

---

## Data Model

```ts
type Testimonial = {
  id: string
  name: string
  role: string
  company: string
  photo: string
  quote: string
  shortQuote?: string
  metrics: {
    label: string
    value: string
  }[]
}
```

---

## State

```ts
const [activeIndex, setActiveIndex] = useState(0)
```

### Derived state
```ts
const total = testimonials.length
const nextIndex = (activeIndex + 1) % total
const prevIndex = (activeIndex - 1 + total) % total
```

---

## Required Functions

```ts
const goTo = (index: number) => setActiveIndex(index)

const next = () => {
  setActiveIndex((prev) => (prev + 1) % total)
}

const prev = () => {
  setActiveIndex((prev) => (prev - 1 + total) % total)
}
```

### Card click behavior
- Clicking a collapsed card promotes it to active:
```ts
onClick={() => goTo(index)}
```

---

## Content Rules

### Active Card Content
Must include:
- Founder photo
- Founder name
- Role + company
- One strong success quote
- Exactly **3 metrics**

### Metrics Format
Each metric should contain:
- Large value
- Short label

Example:
- `3.2x` / Faster time to market
- `+47%` / Increase in active users
- `-28%` / Reduction in infra costs

### Collapsed Card Content
Must include:
- Photo
- Name
- Role + company
- Short quote preview

### Peek Cards
- Minimal visible content
- No metrics
- No detailed quote required

---

## Interaction

### Navigation
- Left arrow → previous testimonial
- Right arrow → next testimonial
- Dots → jump to a specific testimonial

### Animation
Use smooth transitions for:
- Width
- Opacity
- Scale
- Content fade
- Position shift

Recommended transition timing:
- `300ms–500ms`
- easing: `ease-in-out`

### Optional Behavior
- Auto-advance every few seconds
- Pause on hover
- Swipe on mobile

---

## Accessibility

- Arrow buttons must have `aria-label`
- Pagination dots must indicate the active state
- Keyboard support:
  - Left arrow key → previous
  - Right arrow key → next
- Maintain readable contrast in collapsed cards

---

## Implementation Notes

- Use a horizontal track with `overflow: hidden`
- Keep the expanded card visually dominant
- Non-active cards should visually support, not compete
- Keep the component lightweight and presentation-focused
- Do not overcomplicate with extra UI controls

---

## Recommended Component Breakdown

```ts
TestimonialCarousel
  ├── CarouselTrack
  ├── TestimonialCard (expanded / collapsed)
  ├── PeekCard
  ├── MetricItem
  └── CarouselControls
```

---

## Acceptance Criteria
- Matches the supplied wireframe layout
- 16:9 container ratio on desktop
- One expanded card with photo, quote, and 3 metrics
- One larger preview card and two narrow peek cards visible to the right
- Arrow and dot navigation work
- Active card expands; inactive cards collapse
- Smooth reveal / close transitions work correctly
