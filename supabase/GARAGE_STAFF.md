# Garage staff (employees of a garage)

Garage employees log services for the garage they work at, see only their own
work, and build a work history that moves with them between garages.

Not to be confused with `app_role = 'employee'`, which is KYM's own field-sales
staff (referral codes). Garage owners and garage employees both hold the
`garage` role; what they can do comes from `garage_members`.

Migration: `migrations/20261009000100_garage_staff.sql`.

## The journeys

```
Login (phone OTP) → "I own or work at a garage"
        │
        ▼
/garage/start ── "I own the garage" ──────────────► /garage/onboarding (owner) ──► /garage
        │
        └── "I work at a garage": my name + owner's phone
                 │
                 ├── owner already has a garage ──► pick it ──► join request ──► /garage/pending
                 │                                                     owner approves ─► /garage (employee)
                 │                                                     owner rejects  ─► /garage/start
                 │
                 └── owner not on KYM ──► /garage/onboarding (employee sets it up)
                                               garage works at once, hidden from search
                                               owner logs in later ──► /garage/confirm
                                                    "Yes, mine"  ─► listed, owner takes charge
                                                    "Not mine"   ─► taken offline + report to support
```

Owners can also add an employee directly by phone from **Team**; that person is
active at once and lands on the employee dashboard after logging in.

## Who can do what

| Action | Owner | Active employee | Pending / removed employee |
| --- | --- | --- | --- |
| Add a service, verify OTP, mark paid | Any service | Only services they logged | No |
| See services | All of the garage | Only their own | No |
| Garage details, photo, payment QR, price list | Yes | Only the employee who set the garage up, and only until onboarding is finished | No |
| Team: approve, add, remove, rate | Yes | No (can leave) | Can cancel their request |
| Platform fees and settlement | Yes | No — blocked by the next-day lock like the owner, with a message to ask the owner | No |
| Work history | Their employees' (numbers + stars) | Their own (incl. owners' notes) | Their own |

All of this is enforced in the database (RLS + `SECURITY DEFINER` RPCs), not just
hidden in the app.

## Rules and edge cases

- **One garage at a time.** A person has at most one pending/active employee
  membership. An owner of a garage cannot become an employee elsewhere, and an
  active employee cannot be made owner of a new garage.
- **Own number as owner** → refused ("choose Owner instead").
- **Owner already on KYM** → the employee must pick the existing garage and ask
  to join; they cannot create a second garage for that owner.
- **Owner owns several garages** → all are listed to pick from.
- **Owner's number belongs to someone's employee** → refused.
- **Owner adds someone who already asked to join** → the request is approved.
- **Owner adds someone who works elsewhere / is waiting elsewhere** → refused.
- **Owner adds their own number** → refused.
- **Employee-made garage, owner not yet confirmed** → services work, fees accrue
  to the garage, but it is not shown in search or on public pages and its jobs
  are not counted publicly.
- **Owner says "not mine"** → garage off-boarded, every membership ended, a
  report (`ownership_declined`) goes to support. The employee lands back on
  `/garage/start`.
- **Onboarding employee after setup finishes** → becomes a normal employee: no
  more access to garage details, QR or price list.
- **Employee removed or leaves** → loses access to the garage and its records at
  once; their completed jobs stay with the garage; their work history keeps the
  stint (dates, jobs, ratings).
- **In-flight service when an employee is removed** → the owner can resume it
  from their dashboard.
- **Ratings**:
  - Customers rate each *job* (1–5) from Activity, or via the home rating nudge;
    the rating is credited to whoever logged that job.
  - The garage review (stars + comment) is separate and unchanged.
  - Owners rate each employee's stint (1–5 + optional note), any time while
    active, and are prompted when removing someone.
  - Fake ratings are blocked: only the job's customer can rate a job; only the
    garage's owner can rate its employees.
- **Privacy**:
  - Employees see their own owners' notes.
  - An owner reviewing a join request sees the applicant's jobs and star ratings
    across garages, never other owners' notes or customer identities.
  - Customers see only the mechanic's name ("Serviced by Ravi"), snapshotted on
    the service when it was logged.

## Data model

| Table / column | Purpose |
| --- | --- |
| `garage_members` | `garage_id`, `profile_id`, `member_role` (owner/staff), `status` (pending/active/removed/rejected), `display_name`, `joined_at`, `ended_at` |
| `garages.owner_confirmed_at` / `owner_declined_at` / `onboarded_by_profile_id` | Ownership claim when an employee set the garage up |
| `service_records.created_by_profile_id` / `performed_by_name` | Who logged the job, and the name customers see |
| `service_ratings` | One customer rating per completed job |
| `staff_reviews` | One owner rating (+ note) per employee stint |

Key RPCs: `my_garage_membership`, `find_garages_by_owner_phone`,
`request_to_join_garage`, `cancel_join_request`, `create_garage_as_staff`,
`respond_to_garage_claim`, `respond_join_request`, `add_staff_by_phone`,
`remove_staff`, `leave_garage`, `rate_staff`, `garage_team`,
`staff_work_history`, `rate_service`, `can_operate_service`.

## Not built (possible next steps)

- Notifying the owner of a join request by push (free with FCM).
- A shareable work-history link for employees (like the vehicle passport).
- Transferring garage ownership, or several owners per garage.
- Hindi/Marathi for garage onboarding's form fields (the new screens are
  translated).
