-- Contracts can be ongoing (no set end, month to month).
alter table client_contracts drop constraint if exists client_contracts_kind_check;
alter table client_contracts add constraint client_contracts_kind_check check (kind in ('retainer', 'project', 'ongoing'));
alter table client_contracts drop constraint if exists client_contracts_check;
alter table client_contracts add constraint client_contracts_check check (
  (kind = 'retainer' and months is not null) or (kind = 'project' and end_date is not null) or kind = 'ongoing'
);
