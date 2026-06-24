import type { AgentContext, AgentResult } from "./types";
import {
  createCompany,
  createContact,
  createTask,
  createNote,
  associateObjects,
  searchCompanies,
  searchContacts,
  enrollInSequence,
} from "@/lib/hubspot/client";

interface ExecutionInput {
  outreachIds: string[];
  sequenceId?: string;
  senderEmail?: string;
}

export async function execution(
  ctx: AgentContext,
  input: ExecutionInput
): Promise<AgentResult> {
  const errors: string[] = [];
  let tasksCreated = 0;
  let contactsCreated = 0;
  let companiesCreated = 0;
  let enrollments = 0;

  const outreachItems = await ctx.db.outreachQueue.findMany({
    where: {
      id: { in: input.outreachIds },
      status: "APPROVED",
    },
    include: {
      contact: {
        include: {
          account: true,
        },
      },
    },
  });

  if (outreachItems.length === 0) {
    return {
      success: true,
      summary: "No approved outreach items to execute",
      counts: {},
      errors: [],
    };
  }

  // Group by account to batch CRM operations
  const accountMap = new Map<string, typeof outreachItems>();
  for (const item of outreachItems) {
    const accountId = item.contact.accountId;
    if (!accountMap.has(accountId)) accountMap.set(accountId, []);
    accountMap.get(accountId)!.push(item);
  }

  for (const [, items] of accountMap) {
    const account = items[0].contact.account;

    try {
      // Ensure company exists in HubSpot
      let hubspotCompanyId = account.hubspotCompanyId;
      if (!hubspotCompanyId) {
        // Check if exists by domain
        if (account.domain) {
          try {
            const existing = await searchCompanies([
              { propertyName: "domain", operator: "EQ", value: account.domain },
            ]);
            if (existing.results.length > 0) {
              hubspotCompanyId = existing.results[0].id;
            }
          } catch {
            // Continue
          }
        }

        if (!hubspotCompanyId) {
          try {
            const props: Record<string, string> = { name: account.name };
            if (account.domain) props.domain = account.domain;
            if (account.industry) props.industry = account.industry;
            const created = await createCompany(props);
            hubspotCompanyId = created.id;
            companiesCreated++;
          } catch (error) {
            errors.push(`Failed to create company ${account.name}: ${(error as Error).message}`);
          }
        }

        if (hubspotCompanyId) {
          await ctx.db.prospectAccount.update({
            where: { id: account.id },
            data: { hubspotCompanyId },
          });
        }
      }

      // Process each outreach item
      for (const item of items) {
        try {
          const contact = item.contact;

          // Ensure contact exists in HubSpot
          let hubspotContactId = contact.hubspotContactId;
          if (!hubspotContactId && contact.email) {
            try {
              const existing = await searchContacts([
                { propertyName: "email", operator: "EQ", value: contact.email },
              ]);
              if (existing.results.length > 0) {
                hubspotContactId = existing.results[0].id;
              }
            } catch {
              // Continue
            }

            if (!hubspotContactId) {
              try {
                const props: Record<string, string> = {};
                if (contact.email) props.email = contact.email;
                if (contact.firstName) props.firstname = contact.firstName;
                if (contact.lastName) props.lastname = contact.lastName;
                if (contact.title) props.jobtitle = contact.title;
                if (contact.phone) props.phone = contact.phone;
                const created = await createContact(props);
                hubspotContactId = created.id;
                contactsCreated++;
              } catch (error) {
                errors.push(`Failed to create contact ${contact.email}: ${(error as Error).message}`);
              }
            }

            if (hubspotContactId) {
              await ctx.db.prospectContact.update({
                where: { id: contact.id },
                data: { hubspotContactId },
              });
            }
          }

          // Associate contact with company
          if (hubspotContactId && hubspotCompanyId) {
            try {
              await associateObjects("contacts", hubspotContactId, "companies", hubspotCompanyId, 1);
            } catch {
              // Association might already exist
            }
          }

          // Create HubSpot task/action based on outreach type
          if (item.type === "CALL" && hubspotContactId) {
            try {
              await createTask(
                {
                  hs_task_subject: `Call ${contact.firstName} ${contact.lastName} at ${account.name}`,
                  hs_task_body: item.content,
                  hs_task_status: "NOT_STARTED",
                  hs_task_priority: "HIGH",
                  hs_task_type: "CALL",
                },
                hubspotContactId
                  ? [
                      {
                        to: { id: hubspotContactId },
                        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }],
                      },
                    ]
                  : undefined
              );
              tasksCreated++;
            } catch (error) {
              errors.push(`Failed to create call task: ${(error as Error).message}`);
            }
          }

          if (item.type === "EMAIL" && hubspotContactId) {
            if (input.sequenceId && input.senderEmail) {
              try {
                await enrollInSequence(input.sequenceId, hubspotContactId, input.senderEmail);
                enrollments++;
              } catch (error) {
                errors.push(`Failed to enroll in sequence: ${(error as Error).message}`);
                // Fall back to task
                try {
                  await createTask(
                    {
                      hs_task_subject: `Email ${contact.firstName} ${contact.lastName} at ${account.name}`,
                      hs_task_body: `Subject: ${item.subject}\n\n${item.content}`,
                      hs_task_status: "NOT_STARTED",
                      hs_task_priority: "HIGH",
                      hs_task_type: "EMAIL",
                    },
                    [
                      {
                        to: { id: hubspotContactId },
                        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }],
                      },
                    ]
                  );
                  tasksCreated++;
                } catch {
                  // Already logged
                }
              }
            } else {
              try {
                await createTask(
                  {
                    hs_task_subject: `Email ${contact.firstName} ${contact.lastName} at ${account.name}`,
                    hs_task_body: `Subject: ${item.subject}\n\n${item.content}`,
                    hs_task_status: "NOT_STARTED",
                    hs_task_priority: "HIGH",
                    hs_task_type: "EMAIL",
                  },
                  [
                    {
                      to: { id: hubspotContactId },
                      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }],
                    },
                  ]
                );
                tasksCreated++;
              } catch (error) {
                errors.push(`Failed to create email task: ${(error as Error).message}`);
              }
            }
          }

          if (item.type === "LINKEDIN" && hubspotContactId) {
            try {
              await createTask(
                {
                  hs_task_subject: `LinkedIn message ${contact.firstName} ${contact.lastName} at ${account.name}`,
                  hs_task_body: `LinkedIn URL: ${contact.linkedinUrl ?? "N/A"}\n\nMessage:\n${item.content}`,
                  hs_task_status: "NOT_STARTED",
                  hs_task_priority: "MEDIUM",
                  hs_task_type: "TODO",
                },
                [
                  {
                    to: { id: hubspotContactId },
                    types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }],
                  },
                ]
              );
              tasksCreated++;
            } catch (error) {
              errors.push(`Failed to create LinkedIn task: ${(error as Error).message}`);
            }
          }

          // Add note with personalization context
          if (hubspotContactId) {
            try {
              const personalization = contact.personalizationJson as Record<string, unknown> | null;
              const noteBody = [
                `BDR Bot — ${item.type} outreach prepared`,
                `Account: ${account.name}`,
                `Signals: ${account.notes ?? "See prospect dashboard"}`,
                personalization?.objections
                  ? `\nObjection handling:\n${(personalization.objections as Array<{ objection: string; response: string }>).map((o) => `Q: ${o.objection}\nA: ${o.response}`).join("\n\n")}`
                  : "",
              ].join("\n");

              await createNote(
                { hs_note_body: noteBody },
                [
                  {
                    to: { id: hubspotContactId },
                    types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }],
                  },
                ]
              );
            } catch {
              // Non-critical
            }
          }

          // Mark outreach as sent
          await ctx.db.outreachQueue.update({
            where: { id: item.id },
            data: { status: "SENT", sentAt: new Date() },
          });
        } catch (error) {
          await ctx.db.outreachQueue.update({
            where: { id: item.id },
            data: { status: "FAILED", sendError: (error as Error).message },
          });
          errors.push(`Outreach ${item.id} failed: ${(error as Error).message}`);
        }
      }

      // Update account status
      await ctx.db.prospectAccount.update({
        where: { id: account.id },
        data: { status: "OUTREACH" },
      });
    } catch (error) {
      errors.push(`Account ${account.name} execution failed: ${(error as Error).message}`);
    }
  }

  return {
    success: errors.length === 0,
    summary: `Executed ${outreachItems.length} outreach items. Created ${companiesCreated} companies, ${contactsCreated} contacts, ${tasksCreated} tasks, ${enrollments} sequence enrollments.`,
    counts: { tasksCreated, contactsCreated, companiesCreated, enrollments },
    errors,
  };
}
