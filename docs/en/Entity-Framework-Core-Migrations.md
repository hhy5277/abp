﻿# EF Core Advanced Database Migrations

This document begins by **introducing the default structure** provided by [the application startup template](Startup-Templates/Application.md) and **discusses various scenarios** you may want to implement for your own application.

> This document is for who want to fully understand and customize the database structure comes with [the application startup template](Startup-Templates/Application.md). If you simply want to create entities and manage your code first migrations, just follow [the startup tutorials](Tutorials/Index.md).

## About the EF Core Code First Migrations

Entity Framework Core provides an easy to use and powerful [database migration system](https://docs.microsoft.com/en-us/ef/core/managing-schemas/migrations/). ABP Framework [startup templates](Startup-Templates/Index.md) take the advantage of this system to allow you to develop your application in a standard way.

However, EF Core migration system is **not so good in a modular environment** where each module maintains its **own database schema** while two or more modules may **share a single database** in practical.

Since ABP Framework cares about modularity in all aspects, it provides a **solution** to this problem. It is important to understand this solution if you need to **customize your database structure**.

> See [EF Core's own documentation](https://docs.microsoft.com/en-us/ef/core/managing-schemas/migrations/) to fully learn the EF Core Code First Migrations and why you need to such a system.

## The Default Solution & Database Configuration

When you [create a new web application](https://abp.io/get-started) (with EF Core, which is the default database provider), your solution structure will be similar to the picture below:

![bookstore-visual-studio-solution-v3](images/bookstore-visual-studio-solution-v3.png)

> Actual solution structure may be a bit different based on your preferences, but the database part will be same.

### The Database Structure

The startup template has some [application modules](Modules/Index.md) pre-installed. Each layer of the solution has corresponding module package references. So, the `.EntityFrameworkCore` project has the NuGet references for the `.EntityFrameworkCore` packages of the used modules:

![bookstore-efcore-dependencies](images/bookstore-efcore-dependencies.png)

In this way, you collect all the EF Core dependencies under the `.EntityFrameworkCore` project.

> In addition to the module references, it references to the `Volo.Abp.EntityFrameworkCore.SqlServer` package since the startup template is pre-configured for the SQL Server. See the documentation if you want to [switch to another DBMS](Entity-Framework-Core-Other-DBMS.md).

While every module has its own `DbContext` class by design and can use its **own physical database**, the solution is configured to use a **single shared database** as shown in the figure below:

![single-database-usage](images/single-database-usage.png)

This is **the simplest configuration** and suitable for most of the applications. `appsettings.json` file has a **single connection string**, named `Default`:

````json
"ConnectionStrings": {
  "Default": "..."
}
````

So, you have a **single database schema** which contains all the tables of the modules **sharing** this database.

ABP Framework's [connection string](Connection-Strings.md) system allows you to easily **set a different connection string** for a desired module:

````json
"ConnectionStrings": {
  "Default": "...",
  "AbpAuditLogging": "..."
}
````

The example configuration about tells to the ABP Framework to use the second connection string for the [Audit Logging module](Modules/Audit-Logging.md).

However, this is just the beginning. You also need to create the second database, create audit log tables inside it and maintain the database tables using the code first approach. One of the main purposes of this document is to guide you on such database separation scenarios.

#### Module Tables

Every module uses its own databases tables. For example, the [Identity Module](Modules/Identity.md) has some tables to manage the users and roles in the system.

#### Table Prefixes

Since it is allowed to share a single database by all modules (it is the default configuration), a module typically uses a prefix to group its own tables.

The fundamental modules, like [Identity](Modules/Identity.md), [Tenant Management](Modules/Tenant-Management.md) and [Audit Logs](Modules/Audit-Logging.md), use the `Abp` prefix, while some other modules use their own prefixes. [Identity Server](Modules/IdentityServer.md) module uses the `IdentityServer` prefix for example.

If you want, you can change the database table name prefix for a module for your application. Example:

````csharp
Volo.Abp.IdentityServer.AbpIdentityServerDbProperties.DbTablePrefix = "Ids";
````

This code changes the prefix of the [Identity Server](Modules/IdentityServer.md) module. Write this code at the very beginning in your application.

> Every module also defines `DbSchema` property (near to `DbTablePrefix`), so you can set it for the databases support the schema usage.

### The Projects

From the database point of view, there are three important projects those will be explained in the next sections.

#### .EntityFrameworkCore Project

This project has the `DbContext` class (`BookStoreDbContext` for this sample) of your application.

Every module uses its own `DbContext` class to access to the database. Likewise, your application has its own `DbContext`. You typically use this `DbContext` in your application code (in your custom [repositories](Repositories.md) if you follow the best practices). It is almost an empty `DbContext` since your application don't have any entities at the beginning, except the pre-defined `AppUser` entity:

````csharp
[ConnectionStringName("Default")]
public class BookStoreDbContext : AbpDbContext<BookStoreDbContext>
{
    public DbSet<AppUser> Users { get; set; }

    /* Add DbSet properties for your Aggregate Roots / Entities here. */

    public BookStoreDbContext(DbContextOptions<BookStoreDbContext> options)
        : base(options)
    {

    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        /* Configure the shared tables (with included modules) here */

        builder.Entity<AppUser>(b =>
        {
            //Sharing the same table "AbpUsers" with the IdentityUser
            b.ToTable("AbpUsers"); 
            
            //Configure base properties
            b.ConfigureByConvention();
            b.ConfigureAbpUser();

            //Moved customization of the "AbpUsers" table to an extension method
            b.ConfigureCustomUserProperties();
        });

        /* Configure your own tables/entities inside the ConfigureBookStore method */
        builder.ConfigureBookStore();
    }
}
````

This simple `DbContext` class still needs some explanations:

* It defines a `[ConnectionStringName]` attribute which tells ABP to always use the `Default` connection string for this `Dbcontext`.
* It inherits from the `AbpDbContext<T>`  instead of the standard `DbContext` class. You can see the [EF Core integration](Entity-Framework-Core.md) document for more. For now, know that the `AbpDbContext<T>` base class implements some conventions of the ABP Framework to automate some common tasks for you.
* It declares a `DbSet` property for the `AppUser` entity. `AppUser` shares the same table (named `AbpUsers` by default) with the `IdentityUser` entity of the [Identity module](Modules/Identity.md). The startup template provides this entity inside the application since we think that the User entity is generally needs to be customized in your application.
* The constructor takes a `DbContextOptions<T>` instance.
* It overrides the `OnModelCreating` method to define the EF Core mappings.
  * It first calls the the `base.OnModelCreating` method to let the ABP Framework to implement the base mappings for us.
  * It then configures the mapping for the `AppUser` entity. There is a special case for this entity (it shares a table with the Identity module), which will be explained in the next sections.
  * It finally calls the `builder.ConfigureBookStore()` extension method to configure other entities of your application.

This design will be explained in more details after introducing the other database related projects.

#### .EntityFrameworkCore.DbMigrations Project

As mentioned in the previous section, every module (and your application) have **their own** separate `DbContext` classes. Each `DbContext` class only defines the entity to table mappings related to its own module and each module (and your application) use the related `DbContext` class **on runtime**.

As you know, EF Core Code First migration system relies on a `DbContext` class **to track and generate** the code first migrations. So, which `DbContext` we should use for the migrations? The answer is *none of them*. There is another `DbContext` defined in the `.EntityFrameworkCore.DbMigrations` project (which is the `BookStoreMigrationsDbContext` for this example solution).

##### The MigrationsDbContext

The `MigrationsDbContext` is only used to create and apply the database migrations. It is **not used on runtime**. It **merges** all the entity to table mappings of all the used modules plus the application's mappings.

In this way, you create and maintain a **single database migration path**. However, there are some difficulties of this approach and the next sections explains how ABP Framework overcomes these difficulties. But first, see the `BookStoreMigrationsDbContext` class as an example:

````csharp
/* This DbContext is only used for database migrations.
 * It is not used on runtime. See BookStoreDbContext for the runtime DbContext.
 * It is a unified model that includes configuration for
 * all used modules and your application.
 */
public class BookStoreMigrationsDbContext : AbpDbContext<BookStoreMigrationsDbContext>
{
    public BookStoreMigrationsDbContext(
        DbContextOptions<BookStoreMigrationsDbContext> options)
        : base(options)
    {

    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        /* Include modules to your migration db context */
        builder.ConfigurePermissionManagement();
        builder.ConfigureSettingManagement();
        builder.ConfigureBackgroundJobs();
        builder.ConfigureAuditLogging();
        builder.ConfigureIdentity();
        builder.ConfigureIdentityServer();
        builder.ConfigureFeatureManagement();
        builder.ConfigureTenantManagement();

        /* Configure customizations for entities from the modules included  */
        builder.Entity<IdentityUser>(b =>
        {
            b.ConfigureCustomUserProperties();
        });

        /* Configure your own tables/entities inside the ConfigureBookStore method */
        builder.ConfigureBookStore();
    }
}
````

##### Sharing the Mapping Code

First problem is that: A module uses its own `DbContext` which needs to the database mappings. The `MigrationsDbContext` also needs to the same mapping in order to create the database tables for this module. We definitely don't want to duplicate the mapping code.

The solution is to define an extension method (on the `ModelBuilder`) that can be called by both `DbContext` classes. So, every module defines such an extension method.

For example, the `builder.ConfigureBackgroundJobs()` method call configures the database tables for the [Background Jobs module](Modules/Background-Jobs.md). The definition of this extension method is something like that:

````csharp
public static class BackgroundJobsDbContextModelCreatingExtensions
{
    public static void ConfigureBackgroundJobs(
        this ModelBuilder builder,
        Action<BackgroundJobsModelBuilderConfigurationOptions> optionsAction = null)
    {
        var options = new BackgroundJobsModelBuilderConfigurationOptions(
            BackgroundJobsDbProperties.DbTablePrefix,
            BackgroundJobsDbProperties.DbSchema
        );

        optionsAction?.Invoke(options);
        
        builder.Entity<BackgroundJobRecord>(b =>
        {
            b.ToTable(options.TablePrefix + "BackgroundJobs", options.Schema);

            b.ConfigureCreationTime();
            b.ConfigureExtraProperties();

            b.Property(x => x.JobName)
                .IsRequired()
                .HasMaxLength(BackgroundJobRecordConsts.MaxJobNameLength);
            
            //...
        });
    }
}
````

This extension method also gets options to change the database table prefix and schema for this module, but it is not important here.

The final application calls the extension methods inside the `MigrationsDbContext`  class, so it can decide which modules are included to the database maintained by this `MigrationsDbContext`. If you want to create a second database and move some module tables to the second database, then you need to have a second `MigrationsDbContext` class which only calls the extension methods of the related modules. This topic will be detailed in the next sections.

The same `ConfigureBackgroundJobs` method is also called the `DbContext` of the Background Jobs module:

````csharp
[ConnectionStringName(BackgroundJobsDbProperties.ConnectionStringName)]
public class BackgroundJobsDbContext
    : AbpDbContext<BackgroundJobsDbContext>, IBackgroundJobsDbContext
{
    public DbSet<BackgroundJobRecord> BackgroundJobs { get; set; }

    public BackgroundJobsDbContext(DbContextOptions<BackgroundJobsDbContext> options) 
        : base(options)
    {

    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        //Reuse the same extension method!
        builder.ConfigureBackgroundJobs();
    }
}
````

In this way, the mapping configuration of a module can be shared between `DbContext` classes.

##### Reusing a Table of a Module

You may want to reuse a table of a depended module in your application. In this case, you have two options:

1. You can directly use the entity defined by the module.
2. You can create a new entity mapping to the same database table.

###### Use the Entity Defined by a Module

Using an entity defined a module is pretty easy and standard. For example, Identity module defines the `IdentityUser` entity. You can inject the [repository](Repositories.md) for the `IdentityUser` and perform the standard repository operations for this entity. Example:

````csharp
using System;
using System.Threading.Tasks;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Identity;

namespace Acme.BookStore
{
    public class MyService : ITransientDependency
    {
        private readonly IRepository<IdentityUser, Guid> _identityUserRepository;

        public MyService(IRepository<IdentityUser, Guid> identityUserRepository)
        {
            _identityUserRepository = identityUserRepository;
        }

        public async Task DoItAsync()
        {
            //Get all users
            var users = await _identityUserRepository.GetListAsync();
        }
    }
}
````

This example injects the `IRepository<IdentityUser, Guid>` (default repository) which defines the standard repository methods and implements the `IQueryable` interface.

> In addition, Identity module defines the `IIdentityUserRepository` (custom repository) that can also be injected and used by your application. `IIdentityUserRepository` provides additional custom methods for the `IdentityUser` entity while it does not implement the `IQueryable` interface.

###### Create a New Entity

Working with an entity of a module is easy if you want to use the entity as is. However, you may want to define your own entity class and map to the same database table in the following cases;

* You want to add a new field to the table and map it to a property in the entity. You can't use the module's entity since it doesn't have the related property.
* You want to use a subset of the table fields. You don't want to access to all properties of the entity and hide the unrelated properties (from a security perspective or just by design).
* You don't want to directly depend on a module entity class.

In any case, the progress is same. Assume that you want to create an entity, named `AppRole`, mapped to the same table of the `IdentityRole` entity of the [Identity module](Modules/Identity.md).

Here, we will show the implementation, then **will discuss the limitations** (and reasons of the limitations) of this approach.

First, create a new `AppRole` class in your `.Domain` project:

````csharp
using System;
using Volo.Abp.Domain.Entities;
using Volo.Abp.MultiTenancy;

namespace Acme.BookStore.Roles
{
    public class AppRole : AggregateRoot<Guid>, IMultiTenant
    {
        // Properties shared with the IdentityRole class
        
        public Guid? TenantId { get; private set; }
        public string Name { get; private set; }

        //Additional properties

        public string Title { get; set; }

        private AppRole()
        {
            
        }
    }
}
````

* It's inherited from [the `AggregateRoot<Guid>` class](Entities.md) and implements [the `IMultiTenant` interface](Multi-Tenancy.md) because the `IdentityRole` also does the same.
* You can add any properties defined by the `IdentityRole` entity. This examples add only the `TenantId` and `Name` properties since we only need them here. You can make the setters private (like in this example) to prevent changing Identity module's properties accidently.
* You can add custom (additional) properties. This example adds the `Title` property.
* The constructor is provide, so it is not allowed to directly create a new `AppRole` entity. Creating a role is a responsibility of the Identity module. You can query roles, set/update your custom properties, but you should not create or delete a role in your code, as a best practice (while there is nothing restricts you).

Now, it is time to define the EF Core mappings. Open the `DbContext` of your application (`BookStoreDbContext` in this sample) and add the following property:

````csharp
public DbSet<AppRole> Roles { get; set; }
````

Then configure the mapping inside the `OnModelCreating` method (after calling the `base.OnModelCreating(builder)`):

````csharp
protected override void OnModelCreating(ModelBuilder builder)
{
    base.OnModelCreating(builder);

    /* Configure the shared tables (with included modules) here */

    //CONFIGURE THE AppRole ENTITY
    builder.Entity<AppRole>(b =>
    {
        b.ToTable("AbpRoles");
        
        b.ConfigureByConvention();

        b.ConfigureCustomRoleProperties();
    });

    ...

    /* Configure your own tables/entities inside the ConfigureBookStore method */

    builder.ConfigureBookStore();
}
````

We added the following lines:

````csharp
builder.Entity<AppRole>(b =>
{
    b.ToTable("AbpRoles");
    
    b.ConfigureByConvention();

    b.ConfigureCustomRoleProperties();
});
````

* It maps to the same `AbpRoles` table shared with the `IdentityRole` entity.
* `ConfigureByConvention()` configures the standard/base properties (like `TenantId`) and recommended to always call it.

`ConfigureCustomRoleProperties()` has not exists yet. Define it inside the `BookStoreDbContextModelCreatingExtensions` class (near to your `DbContext` in the `.EntityFrameworkCore` project):

````csharp
public static void ConfigureCustomRoleProperties<TRole>(this EntityTypeBuilder<TRole> b)
    where TRole : class, IEntity<Guid>
{
    b.Property<string>(nameof(AppRole.Title)).HasMaxLength(128);
}
````

* This method only defines the custom properties of your entity.
* Unfortunately, we can not utilize the fully type safety here (by referencing the `AppRole` entity). The best we can do is to use the `Title` name as type safe.

You've configured the custom property for your `DbContext` used by your application on the runtime. We also need to configure the `MigrationsDbContext`.

Open the `MigrationsDbContext` (`BookStoreMigrationsDbContext` for this example) and change as shown below:

````csharp
protected override void OnModelCreating(ModelBuilder builder)
{
    base.OnModelCreating(builder);

    /* Include modules to your migration db context */

    ...

    /* Configure customizations for entities from the modules included  */

    //CONFIGURE THE CUSTOM ROLE PROPERTIES
    builder.Entity<IdentityRole>(b =>
    {
        b.ConfigureCustomRoleProperties();
    });

    ...

    /* Configure your own tables/entities inside the ConfigureBookStore method */

    builder.ConfigureBookStore();
}
````

Only added the following lines:

````csharp
builder.Entity<IdentityRole>(b =>
{
    b.ConfigureCustomRoleProperties();
});
````

In this way, we re-used the extension method that is used to configure custom property mappings for the role. But, this time, did the same customization for the `IdentityRole` entity.

Now, you can add a new EF Core database migration using the standard `Add-Migration` command in the Package Manager Console (remember to select `.EntityFrameworkCore.DbMigrations` as the Default Project in the PMC):

![pmc-add-migration-role-title](images/pmc-add-migration-role-title.png)

This command will create a new code first migration class as shown below:

````csharp
public partial class Added_Title_To_Roles : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Title",
            table: "AbpRoles",
            maxLength: 128,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "Title",
            table: "AbpRoles");
    }
}
````

All done! Just run the `Update-Database` command in the PMC or run the `.DbMigrator` project in your solution to apply changes to database.

Now, you can work with the `AppRole` entity just like any other entity of your application. An example [application service](Application-Services.md) that queries and updates roles:

````csharp
public class AppRoleAppService : ApplicationService, IAppRoleAppService
{
    private readonly IRepository<AppRole, Guid> _appRoleRepository;

    public AppRoleAppService(IRepository<AppRole, Guid> appRoleRepository)
    {
        _appRoleRepository = appRoleRepository;
    }

    public async Task<List<AppRoleDto>> GetListAsync()
    {
        var roles = await _appRoleRepository.GetListAsync();

        return roles
            .Select(r => new AppRoleDto
            {
                Id = r.Id,
                Name = r.Name,
                Title = r.Title
            })
            .ToList();
    }

    public async Task UpdateTitleAsync(Guid id, string title)
    {
        var role = await _appRoleRepository.GetAsync(id);
        
        role.Title = title;
        
        await _appRoleRepository.UpdateAsync(role);
    }
}
````

There are some **limitations** of creating a new entity and mapping it to a table of a depended module:

* Your **custom properties must be nullable**. For example, `AppRole.Title` was nullable here. Otherwise, Identity module throws exception because it doesn't know and can not fill the Title when it inserts a new role to the database.
* As a good practice, you should not update the properties defined by the module, especially if it requires a business logic. You typically manage your own properties.

##### Alternative Approaches

Instead of creating an entity to add a custom property, you can use the following approaches.

###### Using the ExtraProperties

All entities derived from the `AggregateRoot ` class can store name-value pairs in their `ExtraProperties` property, which is a `Dictionary<string, object>` serialized to JSON in the database table. So, you can add values to this dictionary and query again without changing the entity.

For example, you can store query the title Property inside an `IdentityRole` instead of creating a new entity. Example:

````csharp
public class IdentityRoleExtendingService : ITransientDependency
{
    private readonly IIdentityRoleRepository _identityRoleRepository;

    public IdentityRoleExtendingService(IIdentityRoleRepository identityRoleRepository)
    {
        _identityRoleRepository = identityRoleRepository;
    }

    public async Task<string> GetTitleAsync(Guid id)
    {
        var role = await _identityRoleRepository.GetAsync(id);

        return role.GetProperty<string>("Title");
    }

    public async Task SetTitleAsync(Guid id, string newTitle)
    {
        var role = await _identityRoleRepository.GetAsync(id);
        
        role.SetProperty("Title", newTitle);
        
        await _identityRoleRepository.UpdateAsync(role);
    }
}
````

* `GetProperty` and `SetProperty` methods are shortcuts to get and set a value in the `role.ExtraProperties` dictionary and they are the recommended way to work with the extra properties.

In this way, you can easily attach any type of value to an entity of a depended module. However, there are some drawbacks of this usage:

* All the extra properties are stored as a single JSON object in the database, they are not stored as new table fields, as you can expect. Creating indexes and using SQL queries against this properties will be harder compared to simple table fields.
* Property names are string, so they are not type safe. It is recommended to define constants for these kind of properties to prevent typo errors.

###### Creating a New Table

Instead of creating a new entity and mapping to the same table, you can create your own table to store your properties. You typically duplicate some values of the original entity. For example, you can add `Name` field to your own table which is a duplication of the `Name` field in the original table.

In this case, you don't deal with migration problems, however you need to deal with the problems of data duplication. When the duplicated value changes, you should reflect the same change in your table. You can use local or distributed [event bus](Event-Bus.md) to subscribe to the change events for the original entity.

#### Discussion of an Alternative Scenario: Every Module Manages Its Own Migration Path

As mentioned before, `.EntityFrameworkCore.DbMigrations` merges all the database mappings of all the modules (plus the application mappings) to create a unified migration path.

An alternative approach would be to allow each module to have its own migrations to maintain its database tables. While it seems more module in the beginning, it has some important drawbacks:

* **EF Core migration system depends on the DBMS provider**. For example, if a module has created migrations for SQL Server, then you can not use this migration code for MySQL (it is not practical for a module to maintain migrations for all available DBMS providers). Leaving the migration to the application code (as explained in this document) allows you to **choose the DBMS in the application** code.
* It would be harder or impossible to **share a table** between modules or **re-use a table** of a module in your application. Because EF Core migration system can not handle it and will throw exceptions like "Table XXX is already exists in the database".
* It would be harder to **customize/enhance** the mapping and the resulting migration code.
* It would be harder to track and **apply changes** to database when you use multiple modules.

## Using Multiple Databases

TODO